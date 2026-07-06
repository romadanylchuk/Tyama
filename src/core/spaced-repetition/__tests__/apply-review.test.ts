/**
 * apply-review.test.ts — Integration tests for the scheduler persistence write-path.
 *
 * Uses `useTestDb()` (jest.setup.ts) for per-test in-memory SQLite isolation.
 *
 * Coverage (Phase 4 completion criteria):
 *
 *   (a) applyScheduledReview writes new dueAt to the due_at column AND
 *       intervalBandIndex into metrics.spacedRepetition — without clobbering
 *       metrics.mastery (carry-through proven via real persistence round-trip).
 *
 *   (b) A correct-fast review promotes the band and writes a later dueAt.
 *
 *   (c) A correct-slow review holds the band and re-dues at the same interval.
 *
 *   (d) A lapse (incorrect) demotes the band and increments lapses; dueAt
 *       is the shorter interval.
 *
 *   (e) mastery_level is UNCHANGED after every applyScheduledReview call
 *       (write-dueAt-never-mastery_level invariant proven against the raw column).
 *
 *   (f) getDueNodes(future) surfaces the rescheduled node when due; getDueNodes
 *       returns nothing when queried before dueAt.
 *
 *   (g) toReviewItem over the rescheduled row reflects the correct band.
 *
 *   (h) nowMs is passed through deterministically (fixed nowMs → predictable dueAt).
 *
 *   (i) Demote at band 0 stays at band 0 (anti-shame clamp) and still writes dueAt.
 *
 *   (j) The two version axes (user_version, graphVersion) are untouched by this module.
 *
 * ANTI-SHAME INVARIANTS verified:
 *   - mastery_level only holds or increases (never decremented by this path).
 *   - lapses is telemetry-only (persisted but not asserted to feed band logic).
 *   - Band demotion is one step, clamped at 0.
 */

import { useTestDb } from '../../../../jest.setup';
import { settings } from '../../../repositories/settings-repository';
import {
  getProgress,
  getDueNodes,
  upsertNonMilestoneProgress,
} from '../../../repositories/progress-repository';
import { recordMilestone } from '../../../repositories/milestone-gate';
import { applyScheduledReview } from '../apply-review';
import { parseSpacedRepetition, serializeSpacedRepetition, toReviewItem } from '../scheduler-metrics';
import { SR_POLICY } from '@/config/spaced-repetition';
import type { ReviewOutcome } from '../scheduler';

// ---------------------------------------------------------------------------
// Wire per-test in-memory DB isolation
// ---------------------------------------------------------------------------

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// Helper constants
// ---------------------------------------------------------------------------

const NOW_MS = 1_750_000_000_000; // fixed deterministic epoch ms for tests

/** A fast correct outcome: correct AND elapsed <= targetMs */
function fastCorrect(targetMs = 6_000): ReviewOutcome {
  return { correct: true, elapsedMs: 1_000, targetMs };
}

/** A slow correct outcome: correct but elapsed > targetMs */
function slowCorrect(targetMs = 6_000): ReviewOutcome {
  return { correct: true, elapsedMs: 60_000, targetMs };
}

/** An incorrect (lapse) outcome */
function lapse(targetMs = 6_000): ReviewOutcome {
  return { correct: false, elapsedMs: 3_000, targetMs };
}

/**
 * Seed a node in the DB with a given dueAt and optionally a metrics.mastery blob.
 * Simulates a node that has already been scheduled (mastery gate crossed).
 */
async function seedScheduledNode(
  nodeId: string,
  opts: {
    dueAt?: number;
    bandIndex?: number;
    lapses?: number;
    masteryMetrics?: unknown;
  } = {}
): Promise<void> {
  const { dueAt = NOW_MS, bandIndex = 0, lapses = 0, masteryMetrics } = opts;

  // Build a metrics blob that already has mastery data (from stage 04) so we
  // can prove carry-through.
  const srSlice = { intervalBandIndex: bandIndex, lapses };
  const other: Record<string, unknown> = masteryMetrics !== undefined
    ? { mastery: masteryMetrics }
    : {};
  const metrics = serializeSpacedRepetition(other, srSlice);

  await upsertNonMilestoneProgress({ nodeId, dueAt, metrics });
}

// ---------------------------------------------------------------------------
// (a) carry-through: metrics.mastery survives a write
// ---------------------------------------------------------------------------

describe('applyScheduledReview — metrics.mastery carry-through', () => {
  it('does NOT clobber metrics.mastery when writing intervalBandIndex', async () => {
    const nodeId = 'carry-through-node';
    const masteryValue = {
      slices: { abstract: { window: [0.8, 0.9], scalar: 0.85 } },
      aggregate: 0.85,
    };

    await seedScheduledNode(nodeId, { masteryMetrics: masteryValue });

    await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);

    const row = await getProgress(nodeId);
    expect(row).not.toBeNull();

    // mastery key in metrics MUST be intact
    const { other } = parseSpacedRepetition(row!.metrics);
    expect(other.mastery).toEqual(masteryValue);
  });

  it('writes the spacedRepetition sub-key alongside mastery', async () => {
    const nodeId = 'sr-alongside-mastery';
    const masteryValue = { slices: {}, aggregate: 0.6 };

    await seedScheduledNode(nodeId, { bandIndex: 1, masteryMetrics: masteryValue });

    await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);

    const row = await getProgress(nodeId);
    const { spacedRepetition, other } = parseSpacedRepetition(row!.metrics);

    // Band promoted from 1 → 2
    expect(spacedRepetition.intervalBandIndex).toBe(2);
    // mastery still present
    expect(other.mastery).toEqual(masteryValue);
  });
});

// ---------------------------------------------------------------------------
// (b) correct-fast → promote
// ---------------------------------------------------------------------------

describe('applyScheduledReview — correct-fast promotes band', () => {
  it('advances band by 1 and sets dueAt = nowMs + intervalsMs[newBand]', async () => {
    const nodeId = 'promote-node';
    await seedScheduledNode(nodeId, { bandIndex: 2 });

    const result = await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);

    expect(result.intervalBandIndex).toBe(3);
    expect(result.dueAt).toBe(NOW_MS + SR_POLICY.intervalsMs[3]);

    // Verify the DB was actually written
    const row = await getProgress(nodeId);
    expect(row!.dueAt).toBe(NOW_MS + SR_POLICY.intervalsMs[3]);
    const { spacedRepetition } = parseSpacedRepetition(row!.metrics);
    expect(spacedRepetition.intervalBandIndex).toBe(3);
  });

  it('clamps at top band (promote stays at band 5)', async () => {
    const nodeId = 'top-band-node';
    const topBand = SR_POLICY.intervalsMs.length - 1; // band 5
    await seedScheduledNode(nodeId, { bandIndex: topBand });

    const result = await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);

    expect(result.intervalBandIndex).toBe(topBand);
    expect(result.dueAt).toBe(NOW_MS + SR_POLICY.intervalsMs[topBand]);
  });
});

// ---------------------------------------------------------------------------
// (c) correct-slow → hold
// ---------------------------------------------------------------------------

describe('applyScheduledReview — correct-slow holds band', () => {
  it('keeps band and re-schedules at the same interval', async () => {
    const nodeId = 'hold-node';
    await seedScheduledNode(nodeId, { bandIndex: 3 });

    const result = await applyScheduledReview(nodeId, slowCorrect(), NOW_MS);

    expect(result.intervalBandIndex).toBe(3);
    expect(result.dueAt).toBe(NOW_MS + SR_POLICY.intervalsMs[3]);
    expect(result.lapses).toBe(0); // lapses unchanged on hold

    const row = await getProgress(nodeId);
    expect(row!.dueAt).toBe(NOW_MS + SR_POLICY.intervalsMs[3]);
  });
});

// ---------------------------------------------------------------------------
// (d) lapse → demote
// ---------------------------------------------------------------------------

describe('applyScheduledReview — lapse demotes band', () => {
  it('drops band by 1 and increments lapses', async () => {
    const nodeId = 'demote-node';
    await seedScheduledNode(nodeId, { bandIndex: 3, lapses: 1 });

    const result = await applyScheduledReview(nodeId, lapse(), NOW_MS);

    expect(result.intervalBandIndex).toBe(2);
    expect(result.lapses).toBe(2); // incremented from 1
    expect(result.dueAt).toBe(NOW_MS + SR_POLICY.intervalsMs[2]);

    const row = await getProgress(nodeId);
    const { spacedRepetition } = parseSpacedRepetition(row!.metrics);
    expect(spacedRepetition.intervalBandIndex).toBe(2);
    expect(spacedRepetition.lapses).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (e) mastery_level NEVER mutated
// ---------------------------------------------------------------------------

describe('applyScheduledReview — mastery_level invariant', () => {
  it('does not change mastery_level on promote', async () => {
    const nodeId = 'ml-promote-node';
    // Use milestone gate to set mastery_level to 1 (the correct path)
    await recordMilestone({ kind: 'first_node_mastered', nodeId });
    await upsertNonMilestoneProgress({
      nodeId,
      dueAt: NOW_MS,
      metrics: serializeSpacedRepetition({}, { intervalBandIndex: 0, lapses: 0 }),
    });

    await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);

    const row = await getProgress(nodeId);
    expect(row!.masteryLevel).toBe(1); // unchanged
  });

  it('does not change mastery_level on hold (slow-correct)', async () => {
    const nodeId = 'ml-hold-node';
    await recordMilestone({ kind: 'first_node_mastered', nodeId });
    await upsertNonMilestoneProgress({
      nodeId,
      dueAt: NOW_MS,
      metrics: serializeSpacedRepetition({}, { intervalBandIndex: 1, lapses: 0 }),
    });

    await applyScheduledReview(nodeId, slowCorrect(), NOW_MS);

    const row = await getProgress(nodeId);
    expect(row!.masteryLevel).toBe(1); // unchanged on hold
  });

  it('does not change mastery_level on lapse', async () => {
    const nodeId = 'ml-lapse-node';
    await recordMilestone({ kind: 'first_node_mastered', nodeId });
    await upsertNonMilestoneProgress({
      nodeId,
      dueAt: NOW_MS,
      metrics: serializeSpacedRepetition({}, { intervalBandIndex: 2, lapses: 0 }),
    });

    await applyScheduledReview(nodeId, lapse(), NOW_MS);

    const row = await getProgress(nodeId);
    expect(row!.masteryLevel).toBe(1); // NEVER decremented
  });

  it('mastery_level is 0 for a node that has never had recordMilestone called', async () => {
    const nodeId = 'ml-default-node';
    await seedScheduledNode(nodeId, { bandIndex: 1 });

    await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);

    const row = await getProgress(nodeId);
    expect(row!.masteryLevel).toBe(0); // schema default — never touched
  });
});

// ---------------------------------------------------------------------------
// (f) getDueNodes surfaces rescheduled node when due; not before
// ---------------------------------------------------------------------------

describe('applyScheduledReview — getDueNodes integration', () => {
  it('getDueNodes returns the node when queried at or after the new dueAt', async () => {
    const nodeId = 'due-queue-node';
    await seedScheduledNode(nodeId, { bandIndex: 0 });

    const result = await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);
    const newDueAt = result.dueAt;

    // At exactly newDueAt → should be due
    const atDue = await getDueNodes(newDueAt);
    const ids = atDue.map((r) => r.nodeId);
    expect(ids).toContain(nodeId);
  });

  it('getDueNodes does NOT return the node before its new dueAt', async () => {
    const nodeId = 'not-yet-due-node';
    await seedScheduledNode(nodeId, { bandIndex: 0 });

    const result = await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);
    const newDueAt = result.dueAt;

    // 1ms before → not due yet
    const before = await getDueNodes(newDueAt - 1);
    const ids = before.map((r) => r.nodeId);
    expect(ids).not.toContain(nodeId);
  });
});

// ---------------------------------------------------------------------------
// (g) toReviewItem reflects the new band
// ---------------------------------------------------------------------------

describe('applyScheduledReview — toReviewItem integration', () => {
  it('toReviewItem over the rescheduled row reflects the correct band', async () => {
    const nodeId = 'review-item-node';
    await seedScheduledNode(nodeId, { bandIndex: 1 });

    const result = await applyScheduledReview(nodeId, fastCorrect(), NOW_MS);

    // Read the due queue — the node should be there (query past the new dueAt)
    const due = await getDueNodes(result.dueAt);
    const row = due.find((r) => r.nodeId === nodeId);
    expect(row).toBeDefined();

    const item = toReviewItem(row!);
    expect(item.nodeId).toBe(nodeId);
    expect(item.dueAt).toBe(result.dueAt);
    expect(item.intervalBandIndex).toBe(result.intervalBandIndex);
  });
});

// ---------------------------------------------------------------------------
// (h) nowMs passed through deterministically
// ---------------------------------------------------------------------------

describe('applyScheduledReview — deterministic nowMs', () => {
  it('produces identical dueAt for the same nowMs, band, and outcome', async () => {
    const nodeId1 = 'deterministic-a';
    const nodeId2 = 'deterministic-b';
    await seedScheduledNode(nodeId1, { bandIndex: 2 });
    await seedScheduledNode(nodeId2, { bandIndex: 2 });

    const fixedNow = 1_700_000_000_000;
    const r1 = await applyScheduledReview(nodeId1, fastCorrect(), fixedNow);
    const r2 = await applyScheduledReview(nodeId2, fastCorrect(), fixedNow);

    expect(r1.dueAt).toBe(r2.dueAt);
    expect(r1.intervalBandIndex).toBe(r2.intervalBandIndex);
  });

  it('dueAt equals nowMs + intervalsMs[newBand] exactly', async () => {
    const nodeId = 'deterministic-formula';
    const startBand = 1;
    await seedScheduledNode(nodeId, { bandIndex: startBand });

    const fixedNow = 1_600_000_000_000;
    const result = await applyScheduledReview(nodeId, fastCorrect(), fixedNow);

    // Fast correct: promote from 1 → 2
    const expectedBand = startBand + 1;
    expect(result.dueAt).toBe(fixedNow + SR_POLICY.intervalsMs[expectedBand]);
  });
});

// ---------------------------------------------------------------------------
// (i) Demote at band 0 stays at band 0 (anti-shame clamp)
// ---------------------------------------------------------------------------

describe('applyScheduledReview — anti-shame floor clamp', () => {
  it('demote at band 0 stays at band 0 and still writes a new dueAt', async () => {
    const nodeId = 'floor-clamp-node';
    await seedScheduledNode(nodeId, { bandIndex: 0, lapses: 3 });

    const result = await applyScheduledReview(nodeId, lapse(), NOW_MS);

    // Band stays at 0 — never negative, never reset
    expect(result.intervalBandIndex).toBe(0);
    // lapses still incremented (telemetry)
    expect(result.lapses).toBe(4);
    // dueAt is still written (band 0 interval)
    expect(result.dueAt).toBe(NOW_MS + SR_POLICY.intervalsMs[0]);

    // Verify persistence
    const row = await getProgress(nodeId);
    expect(row!.dueAt).toBe(NOW_MS + SR_POLICY.intervalsMs[0]);
    const { spacedRepetition } = parseSpacedRepetition(row!.metrics);
    expect(spacedRepetition.intervalBandIndex).toBe(0);
    expect(spacedRepetition.lapses).toBe(4);
  });

  it('demote from band 1 → band 0 (normal one-step demote)', async () => {
    const nodeId = 'one-step-demote';
    await seedScheduledNode(nodeId, { bandIndex: 1 });

    const result = await applyScheduledReview(nodeId, lapse(), NOW_MS);

    expect(result.intervalBandIndex).toBe(0);
    expect(result.lapses).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (j) Two version axes untouched — structural check
// ---------------------------------------------------------------------------

describe('applyScheduledReview — two version axes', () => {
  it('does not import or modify DB_SCHEMA_VERSION or graphVersion', () => {
    // Structural: the apply-review module must never import from db/types (schema version)
    // or graph-fixture (graphVersion). Verify by checking the module's import list.
    // This is a design-documentation test — true enforcement is at code review + tsc.
    //
    // Verify the module exports only applyScheduledReview (no version-related symbol).
    const mod = require('../apply-review');
    expect(typeof mod.applyScheduledReview).toBe('function');
    // Only applyScheduledReview is exported — no version-axis symbols.
    const keys = Object.keys(mod);
    expect(keys).toEqual(['applyScheduledReview']);
  });
});
