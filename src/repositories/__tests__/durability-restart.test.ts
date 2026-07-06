/**
 * Cold-restart durability tests (Phase 5, stage 07).
 *
 * Covers interruption points 1-4 of interview-brief.md's 7-point durability
 * plan (points 5-7 — backup/import and graph-migration durability — are
 * Phase 6):
 *
 *   1. Crash mid recordMilestone's exclusive tx → full rollback, and the
 *      rollback survives a cold restart (both-or-neither).
 *   2. Kill between the milestone commit and the separate relaxed firehose
 *      write → progress + durable_events stay consistent; the firehose event
 *      is simply ABSENT (graceful — firehose is deliberately outside the
 *      atomic boundary, never a consistency violation).
 *   3. Crash after commit, before post-commit subscribeDurable listeners run
 *      → the durable event is persisted regardless; readDurableSince() lets a
 *      late/missed consumer replay it after restart. The emit may be lost;
 *      the fact is not.
 *   4. Firehose compaction armed and pruned to the bone → progress (incl.
 *      streak/xp/mastery scalar) and durable_events are fully intact after a
 *      restart; only firehose rows disappear.
 *
 * HARNESS: uses useRestartableTestDb() (jest.setup.ts, added in this phase),
 * which opens a NAMED database (not ':memory:') so committed data survives a
 * close()+reopen() cycle — proving durability across a simulated cold
 * restart, not just in-transaction rollback (already proven at the unit level
 * by milestone-gate.test.ts's failure-injection tests). A real OS-level
 * process kill is the device matrix's job (feature-plan.md Phase 5,
 * Decision Log 4); this suite proves the same invariant at the unit layer.
 *
 * ASSERTION METHOD (interview-brief.md): after every simulated interruption +
 * reopen, read progress and durable_events and assert the both-or-neither
 * invariant — a durable event exists iff its paired progress.mastery_level
 * increment does. Firehose presence is asserted only as "graceful absence,"
 * never as a consistency requirement.
 */

import { useRestartableTestDb } from '../../../jest.setup';
import { settings } from '../settings-repository';
import { recordMilestone, subscribeDurable } from '../milestone-gate';
import { appendFirehose, readDurableSince, readAllFirehose } from '../events-repository';
import { getProgress, upsertNonMilestoneProgress } from '../progress-repository';
import { applyCompaction } from '../compaction';
import type { RetentionPolicy } from '../compaction';
import { getDb } from '../../db/database';
import type { DurableEvent } from '../../db/types';

// Wire the cold-restart harness: named DB, `reopen()` simulates a process
// kill + cold start (close persists the sql.js image by name; reopen
// reconstitutes it and re-runs the idempotent migration runner).
const { reopen } = useRestartableTestDb();

// Hydrate settings before each test (device-id and logical-clock need this,
// same precondition as milestone-gate.test.ts / compaction.test.ts).
beforeEach(async () => {
  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// Shared failure-injection helper — the same db.runAsync monkey-patch idiom
// proven in milestone-gate.test.ts, generalized to target any guarded table
// by name (durable_events, firehose_events, ...).
// ---------------------------------------------------------------------------

function injectInsertFailure(tableName: string) {
  const db = getDb() as any;
  const original = db.runAsync.bind(db);
  let injected = false;
  const pattern = new RegExp(`insert\\s+(or\\s+\\w+\\s+)?into\\s+${tableName}`, 'i');

  db.runAsync = async (sql: string, ...args: unknown[]) => {
    if (!injected && typeof sql === 'string' && pattern.test(sql)) {
      injected = true;
      throw new Error(`INJECTED FAILURE: simulating ${tableName} insert error`);
    }
    return original(sql, ...args);
  };

  return () => {
    db.runAsync = original;
  };
}

// ---------------------------------------------------------------------------
// Point 1 — atomic milestone, both-or-neither on cold restart
// ---------------------------------------------------------------------------

describe('Point 1 — crash mid recordMilestone exclusive tx (both-or-neither on cold restart)', () => {
  it('rolls back both writes, and the rollback (absence of both) survives a cold restart', async () => {
    const restore = injectInsertFailure('durable_events');

    try {
      await expect(
        recordMilestone({ kind: 'first_node_mastered', nodeId: 'restart-rollback-node' })
      ).rejects.toThrow('INJECTED FAILURE');
    } finally {
      restore();
    }

    // Simulate the process being killed right after the rollback, then a
    // cold restart — proves this isn't just an in-memory rollback illusion.
    await reopen();

    const progress = await getProgress('restart-rollback-node');
    expect(progress).toBeNull();

    const events = await readDurableSince(0);
    expect(events).toHaveLength(0);
  });

  it('a prior successful milestone survives restart untouched by a later rollback, and recordMilestone keeps working after restart', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'restart-survivor-node' });

    const restore = injectInsertFailure('durable_events');
    try {
      await expect(
        recordMilestone({ kind: 'first_node_mastered', nodeId: 'restart-rollback-node-2' })
      ).rejects.toThrow();
    } finally {
      restore();
    }

    await reopen();

    // The survivor's committed state persists across restart...
    const survivor = await getProgress('restart-survivor-node');
    expect(survivor).not.toBeNull();
    expect(survivor!.masteryLevel).toBe(1);

    // ...while the rolled-back node is still absent (both-or-neither held
    // across the restart, not just inside the original transaction).
    const rolledBack = await getProgress('restart-rollback-node-2');
    expect(rolledBack).toBeNull();

    const events = await readDurableSince(0);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('first_node_mastered');

    // The settings-backed device-id/logical-clock seam must be re-hydrated
    // after a real cold start (jest.setup.ts documents this) before it can
    // be relied on again — proves the gate is usable post-restart, not just
    // that old data survived.
    await settings.hydrate();
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'restart-post-restart-node' });
    const postRestart = await getProgress('restart-post-restart-node');
    expect(postRestart!.masteryLevel).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Point 2 — firehose outside the atomic boundary
// ---------------------------------------------------------------------------

describe('Point 2 — kill between the milestone commit and the separate relaxed firehose write', () => {
  it('firehose event is simply absent after restart; progress + durable_events stay consistent (graceful, not a violation)', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'firehose-gap-node' });

    // Simulate the kill: the firehose append that would normally follow the
    // milestone commit never runs at all (the process died before the call).
    await reopen();

    const progress = await getProgress('firehose-gap-node');
    expect(progress).not.toBeNull();
    expect(progress!.masteryLevel).toBe(1);

    const events = await readDurableSince(0);
    expect(events).toHaveLength(1);

    // Graceful absence — firehose is deliberately outside the atomic boundary.
    const firehose = await readAllFirehose();
    expect(firehose).toHaveLength(0);
  });

  it('a firehose write that itself fails mid-insert leaves progress/durable_events untouched and firehose empty, across restart', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'firehose-fail-node' });

    const restore = injectInsertFailure('firehose_events');
    try {
      await expect(appendFirehose('attempt', { x: 1 })).rejects.toThrow('INJECTED FAILURE');
    } finally {
      restore();
    }

    await reopen();

    const progress = await getProgress('firehose-fail-node');
    expect(progress!.masteryLevel).toBe(1);
    expect(await readDurableSince(0)).toHaveLength(1);
    expect(await readAllFirehose()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Point 3 — post-commit emit lost, fact persisted (replay via readDurableSince)
// ---------------------------------------------------------------------------

describe('Point 3 — post-commit emit lost, fact persisted (replay via readDurableSince)', () => {
  it('a milestone committed with no subscriber survives restart and is replayed to a late consumer', async () => {
    // No subscribeDurable() listener registered at all — simulates the
    // process dying before any post-commit listener runs. The emit is lost
    // by construction; the fact must not be.
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'no-listener-node' });

    await reopen();

    const replayed = await readDurableSince(0);
    expect(replayed).toHaveLength(1);
    expect(replayed[0].kind).toBe('first_node_mastered');
  });

  it('a throwing listener does not prevent the event from persisting or being replayed after restart', async () => {
    const unsub = subscribeDurable(() => {
      throw new Error('simulated listener crash — must not affect persistence');
    });

    try {
      // recordMilestone must NOT reject even though its listener throws —
      // _emitDurable catches listener errors because the event is already committed.
      await expect(
        recordMilestone({ kind: 'first_node_mastered', nodeId: 'throwing-listener-node' })
      ).resolves.toBeUndefined();
    } finally {
      unsub();
    }

    await reopen();

    const replayed: DurableEvent[] = await readDurableSince(0);
    expect(replayed).toHaveLength(1);
    expect(replayed[0].kind).toBe('first_node_mastered');

    const progress = await getProgress('throwing-listener-node');
    expect(progress!.masteryLevel).toBe(1);
  });

  it('a late consumer resuming from a known seq only sees events after it, across restart', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'seq-a' });
    const firstBatch = await readDurableSince(0);
    const lastSeq = firstBatch[0].seq;

    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'seq-b' });

    await reopen();

    const resumed = await readDurableSince(lastSeq);
    expect(resumed).toHaveLength(1);

    const all = await readDurableSince(0);
    expect(all).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Point 4 — armed compaction, durable/streak/mastery-scalar immunity, across restart
// ---------------------------------------------------------------------------

const ARMED_POLICY: RetentionPolicy = {
  enabled: true,
  maxAgeDays: 30,
  maxRows: 5,
  trigger: 'manual',
};

describe('Point 4 — armed compaction is durable/streak/mastery-scalar immune, across restart', () => {
  it('progress (incl. streak/xp/metrics), durable_events, and mastery_level survive an armed compaction + restart; only firehose shrinks', async () => {
    // Seed a milestone (durable_events + mastery_level)...
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'compaction-node' });

    // ...a non-milestone streak/xp/mastery-scalar update on the SAME node...
    const scalarMetrics = JSON.stringify({ mastery: { aggregate: 0.42 } });
    await upsertNonMilestoneProgress({
      nodeId: 'compaction-node',
      streak: 7,
      xp: 250,
      metrics: scalarMetrics,
    });

    // ...and a pile of firehose rows, more than ARMED_POLICY.maxRows (5).
    for (let i = 0; i < 8; i++) {
      await appendFirehose('attempt', { i });
    }

    const droppedCount = await applyCompaction(ARMED_POLICY, Date.now());
    expect(droppedCount).toBeGreaterThan(0);

    // Simulate the kill right after compaction commits, then cold-restart.
    await reopen();

    const progress = await getProgress('compaction-node');
    expect(progress).not.toBeNull();
    expect(progress!.masteryLevel).toBe(1); // milestone-set mastery_level intact
    expect(progress!.streak).toBe(7); // anti-shame: streak intact
    expect(progress!.xp).toBe(250); // XP intact (never decreases)
    expect(JSON.parse(progress!.metrics)).toEqual({ mastery: { aggregate: 0.42 } });

    const events = await readDurableSince(0);
    expect(events).toHaveLength(1); // durable_events fully intact — compaction never touches it

    const firehose = await readAllFirehose();
    expect(firehose.length).toBe(8 - droppedCount); // only firehose rows were pruned
    expect(firehose.length).toBeLessThan(8);
  });
});

// ---------------------------------------------------------------------------
// Both-or-neither invariant — asserted uniformly, across restart
// ---------------------------------------------------------------------------

describe('Both-or-neither invariant — asserted uniformly across restart', () => {
  it('a durable event exists iff its paired mastery_level increment does (no orphan on either side)', async () => {
    // Successful case: both a progress row AND its durable event exist.
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'invariant-both' });

    // Rolled-back case: neither a progress row NOR a durable event exist.
    const restore = injectInsertFailure('durable_events');
    try {
      await expect(
        recordMilestone({ kind: 'first_node_mastered', nodeId: 'invariant-neither' })
      ).rejects.toThrow();
    } finally {
      restore();
    }

    await reopen();

    const both = await getProgress('invariant-both');
    const neither = await getProgress('invariant-neither');
    const events = await readDurableSince(0);

    expect(both).not.toBeNull();
    expect(both!.masteryLevel).toBe(1);
    expect(events.some((e) => e.kind === 'first_node_mastered')).toBe(true);

    expect(neither).toBeNull();
    expect(events).toHaveLength(1); // only 'invariant-both'; never a partial write
  });
});
