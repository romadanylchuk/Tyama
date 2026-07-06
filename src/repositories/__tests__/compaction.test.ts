/**
 * Tests for the firehose compaction mechanism.
 *
 * Completion criteria (Phase 5):
 *   (a) Disabled policy → decideCompaction returns [] and applyCompaction returns 0.
 *   (b) Armed (test-local enabled policy) → drops only firehose rows exceeding
 *       age/count limits.
 *   (c) DURABLE IMMUNITY GUARDRAIL — even when armed, durable_events row count
 *       is unchanged after applyCompaction().
 *   (d) decideCompaction purity — same inputs → same output; no side effects.
 *   (e) Age rule drops rows older than maxAgeDays.
 *   (f) Count rule drops oldest rows beyond maxRows.
 *   (g) Both rules combined (union of eligible ids).
 */

import { useTestDb } from '../../../jest.setup';
import { settings } from '../settings-repository';
import { decideCompaction, applyCompaction } from '../compaction';
import { appendFirehose, readAllFirehose } from '../events-repository';
import { recordMilestone } from '../milestone-gate';
import { getDb } from '../../db/database';
import { RETENTION_POLICY } from '@/config/retention';
import type { RetentionPolicy } from '../compaction';
import type { FirehoseEvent } from '../../db/types';

// Per-test in-memory DB isolation.
useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// Test-local retention policies
// ---------------------------------------------------------------------------

const DISABLED_POLICY: RetentionPolicy = {
  enabled: false,
  maxAgeDays: 90,
  maxRows: 50_000,
  trigger: 'manual',
};

const ARMED_POLICY: RetentionPolicy = {
  enabled: true,
  maxAgeDays: 30,
  maxRows: 5,
  trigger: 'manual',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Build a minimal FirehoseEvent fixture without touching the DB. */
function makeFirehoseEvent(id: number, createdAt: number): FirehoseEvent {
  return {
    id,
    type: 'test',
    payload: '{}',
    deviceId: 'test-device',
    seq: id,
    createdAt,
  };
}

/** Count rows in a table by name. */
async function countRows(table: 'firehose_events' | 'durable_events'): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// (a) Disabled policy — decideCompaction and applyCompaction are no-ops
// ---------------------------------------------------------------------------

describe('decideCompaction — disabled policy', () => {
  it('returns [] regardless of rows or time', () => {
    const now = Date.now();
    const rows = [
      makeFirehoseEvent(1, now - 200 * MS_PER_DAY), // very old
      makeFirehoseEvent(2, now - 100 * MS_PER_DAY),
    ];

    const result = decideCompaction(rows, DISABLED_POLICY, now);
    expect(result).toEqual([]);
  });

  it('returns [] for an empty rows array', () => {
    expect(decideCompaction([], DISABLED_POLICY, Date.now())).toEqual([]);
  });
});

describe('applyCompaction — disabled policy', () => {
  it('returns 0 and does not touch firehose_events', async () => {
    await appendFirehose('attempt', { x: 1 });
    await appendFirehose('attempt', { x: 2 });

    const countBefore = await countRows('firehose_events');
    const dropped = await applyCompaction(DISABLED_POLICY, Date.now());

    expect(dropped).toBe(0);
    expect(await countRows('firehose_events')).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// (e) Age rule
// ---------------------------------------------------------------------------

describe('decideCompaction — age rule', () => {
  it('marks rows older than maxAgeDays as eligible', () => {
    const now = Date.now();
    const rows = [
      makeFirehoseEvent(1, now - 31 * MS_PER_DAY), // older than 30 days
      makeFirehoseEvent(2, now - 29 * MS_PER_DAY), // within 30 days
      makeFirehoseEvent(3, now - 100 * MS_PER_DAY), // much older
      makeFirehoseEvent(4, now - 1 * MS_PER_DAY), // recent
    ];

    const result = decideCompaction(rows, ARMED_POLICY, now);

    expect(result).toContain(1);
    expect(result).toContain(3);
    expect(result).not.toContain(2);
    expect(result).not.toContain(4);
  });

  it('returns [] when all rows are within maxAgeDays', () => {
    const now = Date.now();
    const rows = [
      makeFirehoseEvent(1, now - 1 * MS_PER_DAY),
      makeFirehoseEvent(2, now - 5 * MS_PER_DAY),
    ];
    // ARMED_POLICY maxAgeDays=30
    expect(decideCompaction(rows, ARMED_POLICY, now)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (f) Count rule
// ---------------------------------------------------------------------------

describe('decideCompaction — count rule', () => {
  it('marks oldest rows beyond maxRows as eligible', () => {
    const now = Date.now();
    // ARMED_POLICY.maxRows = 5 → 7 rows means 2 oldest are eligible.
    const rows = Array.from({ length: 7 }, (_, i) =>
      makeFirehoseEvent(i + 1, now - (7 - i) * 1000) // id 1 is oldest
    );

    const result = decideCompaction(rows, ARMED_POLICY, now);

    // The 2 oldest (ids 1 and 2) should be in the result.
    expect(result).toContain(1);
    expect(result).toContain(2);
    // The rest should not be in the result (not triggered by count alone).
    expect(result).not.toContain(3);
    expect(result).not.toContain(7);
  });

  it('returns [] when row count <= maxRows', () => {
    const now = Date.now();
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeFirehoseEvent(i + 1, now - i * 1000)
    );
    expect(decideCompaction(rows, ARMED_POLICY, now)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (g) Both rules combined
// ---------------------------------------------------------------------------

describe('decideCompaction — age + count combined', () => {
  it('returns union of age-eligible and count-eligible ids', () => {
    const now = Date.now();
    // 8 rows; maxRows=5 → 3 oldest by count eligible.
    // Row id 8 is also very old (age-eligible).
    const rows = [
      makeFirehoseEvent(1, now - 1000), // count-eligible (oldest 3)
      makeFirehoseEvent(2, now - 900),  // count-eligible
      makeFirehoseEvent(3, now - 800),  // count-eligible
      makeFirehoseEvent(4, now - 700),
      makeFirehoseEvent(5, now - 600),
      makeFirehoseEvent(6, now - 500),
      makeFirehoseEvent(7, now - 400),
      makeFirehoseEvent(8, now - 60 * MS_PER_DAY), // age-eligible (old) but NOT count-old by index position
    ];

    const result = decideCompaction(rows, ARMED_POLICY, now);

    // Count rule: rows 1,2,3 (8-5=3 excess, oldest 3 by id).
    expect(result).toContain(1);
    expect(result).toContain(2);
    expect(result).toContain(3);
    // Age rule: row 8 (60 days > 30-day limit).
    expect(result).toContain(8);
    // Rows 4,5,6,7 are neither old nor excess.
    expect(result).not.toContain(4);
    expect(result).not.toContain(5);
    expect(result).not.toContain(6);
    expect(result).not.toContain(7);
  });
});

// ---------------------------------------------------------------------------
// (d) decideCompaction purity
// ---------------------------------------------------------------------------

describe('decideCompaction — purity', () => {
  it('returns identical output for identical inputs (deterministic)', () => {
    const now = 1_700_000_000_000;
    const rows = [
      makeFirehoseEvent(1, now - 40 * MS_PER_DAY),
      makeFirehoseEvent(2, now - 10 * MS_PER_DAY),
      makeFirehoseEvent(3, now - 50 * MS_PER_DAY),
    ];

    const result1 = decideCompaction(rows, ARMED_POLICY, now);
    const result2 = decideCompaction(rows, ARMED_POLICY, now);

    expect(result1).toEqual(result2);
  });

  it('does not mutate the input rows array', () => {
    const now = Date.now();
    const rows = [
      makeFirehoseEvent(1, now - 40 * MS_PER_DAY),
      makeFirehoseEvent(2, now - 5 * MS_PER_DAY),
    ];
    const originalLength = rows.length;
    const originalIds = rows.map((r) => r.id);

    decideCompaction(rows, ARMED_POLICY, now);

    expect(rows.length).toBe(originalLength);
    expect(rows.map((r) => r.id)).toEqual(originalIds);
  });
});

// ---------------------------------------------------------------------------
// (b) Armed compaction — drops firehose rows but not durable
// ---------------------------------------------------------------------------

describe('applyCompaction — armed policy', () => {
  it('deletes firehose rows that exceed age limit', async () => {
    const db = getDb();
    const now = Date.now();
    const old = now - 60 * MS_PER_DAY;
    const recent = now - 1000;

    // Insert directly to control created_at.
    await db.runAsync(
      `INSERT INTO firehose_events (type, payload, device_id, seq, created_at) VALUES (?, ?, ?, ?, ?)`,
      'old-event', '{}', 'dev', 1, old
    );
    await db.runAsync(
      `INSERT INTO firehose_events (type, payload, device_id, seq, created_at) VALUES (?, ?, ?, ?, ?)`,
      'recent-event', '{}', 'dev', 2, recent
    );

    const dropped = await applyCompaction(ARMED_POLICY, now);

    expect(dropped).toBe(1); // only the old one
    const remaining = await readAllFirehose();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].type).toBe('recent-event');
  });

  it('deletes firehose rows that exceed count limit', async () => {
    const db = getDb();
    const now = Date.now();
    // Insert 7 rows (all recent); ARMED_POLICY.maxRows=5 → 2 oldest should drop.
    for (let i = 0; i < 7; i++) {
      await db.runAsync(
        `INSERT INTO firehose_events (type, payload, device_id, seq, created_at) VALUES (?, ?, ?, ?, ?)`,
        `event-${i}`, '{}', 'dev', i, now - (7 - i) * 1000
      );
    }

    const dropped = await applyCompaction(ARMED_POLICY, now);

    expect(dropped).toBe(2);
    expect(await countRows('firehose_events')).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// (c) DURABLE IMMUNITY GUARDRAIL
// ---------------------------------------------------------------------------

describe('applyCompaction — durable immunity guardrail', () => {
  it('GUARDRAIL: durable_events row count is unchanged even when compaction is armed', async () => {
    const db = getDb();
    const now = Date.now();

    // Seed two durable milestone events.
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'node-d1' });
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'node-d2' });

    const durableCountBefore = await countRows('durable_events');
    expect(durableCountBefore).toBe(2);

    // Seed many firehose rows (some old) to trigger both age and count rules.
    const old = now - 60 * MS_PER_DAY;
    for (let i = 0; i < 8; i++) {
      await db.runAsync(
        `INSERT INTO firehose_events (type, payload, device_id, seq, created_at) VALUES (?, ?, ?, ?, ?)`,
        `attempt-${i}`, '{}', 'dev', i + 100,
        i < 3 ? old : now - 1000 // first 3 are old (age-eligible)
      );
    }

    // ARM compaction for this test only.
    const dropped = await applyCompaction(ARMED_POLICY, now);

    // Some firehose rows were dropped.
    expect(dropped).toBeGreaterThan(0);

    // GUARDRAIL: durable_events row count must be EXACTLY the same as before.
    const durableCountAfter = await countRows('durable_events');
    expect(durableCountAfter).toBe(durableCountBefore);
    expect(durableCountAfter).toBe(2);
  });

  it('GUARDRAIL: disabled policy → auto path is a no-op (enabled:false check)', async () => {
    // RETENTION_POLICY ships with enabled:false (imported statically at top of file).
    expect(RETENTION_POLICY.enabled).toBe(false);

    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'node-e1' });
    const durableCount = await countRows('durable_events');

    // applyCompaction() with no args uses the shipped default (disabled).
    const dropped = await applyCompaction();
    expect(dropped).toBe(0);
    expect(await countRows('durable_events')).toBe(durableCount);
  });
});
