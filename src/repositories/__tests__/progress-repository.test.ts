/**
 * Tests for the progress repository.
 *
 * Coverage (Phase 4 completion criteria):
 *   (a) getDueNodes returns only rows where due_at <= now, ordered by due_at
 *   (b) upsertNonMilestoneProgress never changes mastery_level
 *   (c) getProgress returns null for unknown nodes
 *   (d) upsertNonMilestoneProgress creates a row if it doesn't exist
 *   (e) upsertNonMilestoneProgress updates non-milestone fields on existing rows
 */

import { useTestDb } from '../../../jest.setup';
import { settings } from '../settings-repository';
import {
  getProgress,
  getDueNodes,
  upsertNonMilestoneProgress,
} from '../progress-repository';
import { recordMilestone } from '../milestone-gate';
// Barrel imported at top (import/first rule requires all imports before other code)
import * as repositoriesBarrel from '../index';
// Static import for structural guard checks (dynamic import not supported by Babel Jest)
import * as progressModuleForGuard from '../progress-repository';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// (c) getProgress — null for unknown nodes
// ---------------------------------------------------------------------------

describe('getProgress', () => {
  it('returns null for a node that has no progress row', async () => {
    const p = await getProgress('nonexistent-node');
    expect(p).toBeNull();
  });

  it('returns the correct row after upsertNonMilestoneProgress', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'get-test-node', streak: 3, xp: 50 });
    const p = await getProgress('get-test-node');
    expect(p).not.toBeNull();
    expect(p!.nodeId).toBe('get-test-node');
    expect(p!.streak).toBe(3);
    expect(p!.xp).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// (a) getDueNodes — partial-indexed due_at query
// ---------------------------------------------------------------------------

describe('getDueNodes', () => {
  it('returns empty array when no nodes have a due_at', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'no-due-node' });
    const due = await getDueNodes(Date.now());
    expect(due).toHaveLength(0);
  });

  it('returns only nodes with due_at <= now', async () => {
    const now = Date.now();
    const past = now - 10_000;
    const future = now + 60_000;

    await upsertNonMilestoneProgress({ nodeId: 'due-past', dueAt: past });
    await upsertNonMilestoneProgress({ nodeId: 'due-future', dueAt: future });
    await upsertNonMilestoneProgress({ nodeId: 'due-null' }); // no due_at

    const due = await getDueNodes(now);
    const ids = due.map((r) => r.nodeId);

    expect(ids).toContain('due-past');
    expect(ids).not.toContain('due-future');
    expect(ids).not.toContain('due-null');
  });

  it('orders results ascending by due_at (most overdue first)', async () => {
    const now = Date.now();
    const oldest = now - 30_000;
    const middle = now - 10_000;
    const newest = now - 1_000;

    // Insert in non-sorted order
    await upsertNonMilestoneProgress({ nodeId: 'order-c', dueAt: newest });
    await upsertNonMilestoneProgress({ nodeId: 'order-a', dueAt: oldest });
    await upsertNonMilestoneProgress({ nodeId: 'order-b', dueAt: middle });

    const due = await getDueNodes(now);
    expect(due).toHaveLength(3);
    expect(due[0].nodeId).toBe('order-a'); // oldest
    expect(due[1].nodeId).toBe('order-b'); // middle
    expect(due[2].nodeId).toBe('order-c'); // newest
  });

  it('a node with due_at exactly = now is included', async () => {
    const now = Date.now();
    await upsertNonMilestoneProgress({ nodeId: 'exact-now', dueAt: now });

    const due = await getDueNodes(now);
    expect(due.map((r) => r.nodeId)).toContain('exact-now');
  });
});

// ---------------------------------------------------------------------------
// (b) upsertNonMilestoneProgress — never changes mastery_level
// ---------------------------------------------------------------------------

describe('upsertNonMilestoneProgress — mastery_level isolation', () => {
  it('never sets mastery_level on INSERT (defaults to 0)', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'mastery-new', streak: 5, xp: 100 });
    const p = await getProgress('mastery-new');
    expect(p!.masteryLevel).toBe(0); // schema default
  });

  it('does not change mastery_level on UPDATE even if milestone was set before', async () => {
    // First, set mastery_level via the gate (the correct path)
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'mastery-gate-node' });
    const before = await getProgress('mastery-gate-node');
    expect(before!.masteryLevel).toBe(1);

    // Now call upsertNonMilestoneProgress — must NOT touch mastery_level
    await upsertNonMilestoneProgress({
      nodeId: 'mastery-gate-node',
      streak: 10,
      xp: 200,
    });

    const after = await getProgress('mastery-gate-node');
    expect(after!.masteryLevel).toBe(1); // unchanged
    expect(after!.streak).toBe(10);     // updated
    expect(after!.xp).toBe(200);        // updated
  });

  it('does not lower mastery_level if a node with mastery > 0 is upserted', async () => {
    // Create row with mastery via gate
    await recordMilestone({ kind: 'first_domain_completed', nodeId: 'mastery-guard' });
    const before = await getProgress('mastery-guard');
    expect(before!.masteryLevel).toBe(2);

    // Upsert without mastery — mastery must hold
    await upsertNonMilestoneProgress({ nodeId: 'mastery-guard', xp: 999 });
    const after = await getProgress('mastery-guard');
    expect(after!.masteryLevel).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (d) upsertNonMilestoneProgress — creates row if it doesn't exist
// ---------------------------------------------------------------------------

describe('upsertNonMilestoneProgress — insert path', () => {
  it('creates a progress row with the supplied fields', async () => {
    await upsertNonMilestoneProgress({
      nodeId: 'new-row',
      streak: 2,
      xp: 40,
      metrics: '{"attempts":4}',
    });

    const p = await getProgress('new-row');
    expect(p).not.toBeNull();
    expect(p!.streak).toBe(2);
    expect(p!.xp).toBe(40);
    expect(p!.metrics).toBe('{"attempts":4}');
    expect(p!.dueAt).toBeNull();
  });

  it('sets due_at when supplied', async () => {
    const ts = Date.now() + 86400_000;
    await upsertNonMilestoneProgress({ nodeId: 'due-insert', dueAt: ts });

    const p = await getProgress('due-insert');
    expect(p!.dueAt).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// (e) upsertNonMilestoneProgress — update path (partial updates)
// ---------------------------------------------------------------------------

describe('upsertNonMilestoneProgress — update path', () => {
  it('updates only the supplied fields (COALESCE semantics)', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'partial-node', streak: 1, xp: 10 });

    // Update only xp — streak should remain unchanged
    await upsertNonMilestoneProgress({ nodeId: 'partial-node', xp: 99 });

    const p = await getProgress('partial-node');
    expect(p!.streak).toBe(1);  // unchanged
    expect(p!.xp).toBe(99);    // updated
  });

  it('sets updated_at to a recent timestamp on every upsert', async () => {
    const before = Date.now();
    await upsertNonMilestoneProgress({ nodeId: 'ts-node', xp: 1 });
    const after = Date.now();

    const p = await getProgress('ts-node');
    expect(p!.updatedAt).toBeGreaterThanOrEqual(before);
    expect(p!.updatedAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// SF-1: dueAt can be explicitly cleared to NULL
// ---------------------------------------------------------------------------

describe('upsertNonMilestoneProgress — explicit dueAt null clearing (SF-1)', () => {
  it('preserves existing due_at when dueAt key is absent from the update', async () => {
    const ts = Date.now() + 86400_000;
    await upsertNonMilestoneProgress({ nodeId: 'preserve-due', dueAt: ts });

    // Update xp without supplying dueAt key — due_at must be preserved
    await upsertNonMilestoneProgress({ nodeId: 'preserve-due', xp: 50 });

    const p = await getProgress('preserve-due');
    expect(p!.dueAt).toBe(ts);   // unchanged
    expect(p!.xp).toBe(50);      // updated
  });

  it('explicitly clears due_at to NULL when dueAt: null is supplied', async () => {
    const ts = Date.now() + 86400_000;
    await upsertNonMilestoneProgress({ nodeId: 'clear-due', dueAt: ts });
    const before = await getProgress('clear-due');
    expect(before!.dueAt).toBe(ts);

    // Explicitly supply null — stage 05 un-scheduling path
    await upsertNonMilestoneProgress({ nodeId: 'clear-due', dueAt: null });

    const after = await getProgress('clear-due');
    expect(after!.dueAt).toBeNull();
  });

  it('sets due_at to a concrete value when dueAt key is supplied with a number', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'set-due' });
    const ts = Date.now() + 3_600_000;
    await upsertNonMilestoneProgress({ nodeId: 'set-due', dueAt: ts });

    const p = await getProgress('set-due');
    expect(p!.dueAt).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// SF-2: getDueNodes filters out sentinel node ids
// ---------------------------------------------------------------------------

describe('getDueNodes — sentinel node id filtering (SF-2)', () => {
  it('does not return sentinel rows (__milestone_*) even if due_at is set', async () => {
    // Simulate a sentinel row that somehow got a due_at (should never surface in queue)
    await upsertNonMilestoneProgress({
      nodeId: '__milestone_first_domain_completed__',
      dueAt: Date.now() - 1000,
    });

    // Also add a real node with a due_at
    await upsertNonMilestoneProgress({ nodeId: 'real-due-node', dueAt: Date.now() - 500 });

    const due = await getDueNodes(Date.now());
    const ids = due.map((r) => r.nodeId);

    // Real node appears; sentinel does not
    expect(ids).toContain('real-due-node');
    expect(ids).not.toContain('__milestone_first_domain_completed__');
  });

  it('returns only real skill-graph nodes in the due queue', async () => {
    // Add multiple sentinels and real nodes
    await upsertNonMilestoneProgress({ nodeId: '__milestone_first_node_mastered__', dueAt: Date.now() - 100 });
    await upsertNonMilestoneProgress({ nodeId: '__milestone_first_streak_reached__', dueAt: Date.now() - 200 });
    await upsertNonMilestoneProgress({ nodeId: 'real-node-a', dueAt: Date.now() - 300 });
    await upsertNonMilestoneProgress({ nodeId: 'real-node-b', dueAt: Date.now() - 50 });

    const due = await getDueNodes(Date.now());
    const ids = due.map((r) => r.nodeId);

    expect(ids).toContain('real-node-a');
    expect(ids).toContain('real-node-b');
    expect(ids.every((id) => !id.startsWith('__milestone_'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Structural: confirm _writeMilestoneState is NOT in barrel or any module export
// ---------------------------------------------------------------------------

describe('Structural guard — _writeMilestoneState not in barrel', () => {
  it('is NOT exported from the repositories barrel', () => {
    // _writeMilestoneState is module-local in milestone-gate.ts — not importable.
    // Must NOT appear in the public barrel.
    expect((repositoriesBarrel as any)['_writeMilestoneState']).toBeUndefined();
  });

  it('is NOT exported from progress-repository (moved to milestone-gate)', () => {
    // _writeMilestoneState has been moved to milestone-gate.ts as a module-local fn.
    expect((progressModuleForGuard as any)['_writeMilestoneState']).toBeUndefined();
  });
});
