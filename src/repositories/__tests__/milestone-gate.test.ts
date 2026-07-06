/**
 * Tests for the milestone gate (recordMilestone).
 *
 * Completion criteria (Phase 4):
 *   (a) recordMilestone writes BOTH milestone state AND exactly one durable event
 *   (b) Failure injection — a throw mid-tx rolls back BOTH writes (both-or-neither)
 *   (c) subscribeDurable listener receives the event after commit only
 *   (d) Firehose is NOT touched by the gate
 *   (e) The committed durable event carries deviceId + monotonic seq + createdAt
 *   (f) Anti-shame: mastery_level only increases via MAX
 *
 * STRUCTURAL ENFORCEMENT VERIFICATION:
 *   The milestone-gate now collocates _writeMilestoneState, _insertDurableEvent,
 *   and _emitDurable as module-local non-exported functions. They are NOT importable
 *   from any other module. The barrel guard test below confirms the public barrel
 *   exposes none of them, and the ESLint rule (no-direct-milestone-mutation) enforces
 *   that no attempt to import them by name goes undetected.
 */

import { useTestDb } from '../../../jest.setup';
import { settings } from '../settings-repository';
import { recordMilestone } from '../milestone-gate';
import {
  readDurableSince,
  subscribeDurable,
  readAllFirehose,
} from '../events-repository';
import { getProgress } from '../progress-repository';
import { getDb } from '../../db/database';
import type { DurableEvent } from '../../db/types';
// Barrel and module star-imports at top (import/first rule)
import * as repositoriesBarrel from '../index';
import * as eventsModule from '../events-repository';
import * as milestoneGateModule from '../milestone-gate';
import * as progressModule from '../progress-repository';

// Wire per-test in-memory DB isolation.
useTestDb();

// Hydrate settings before each test (device-id and logical-clock need this).
beforeEach(async () => {
  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// Helper: patch db.runAsync to throw on first INSERT INTO durable_events
// ---------------------------------------------------------------------------

function injectDurableInsertFailure() {
  const db = getDb() as any;
  const original = db.runAsync.bind(db);
  let injected = false;

  db.runAsync = async (sql: string, ...args: any[]) => {
    if (!injected && typeof sql === 'string' && /insert\s+(or\s+\w+\s+)?into\s+durable_events/i.test(sql)) {
      injected = true;
      throw new Error('INJECTED FAILURE: simulating durable_events insert error');
    }
    return original(sql, ...args);
  };

  return () => { db.runAsync = original; };
}

// ---------------------------------------------------------------------------
// (a) recordMilestone writes BOTH milestone state AND exactly one durable event
// ---------------------------------------------------------------------------

describe('recordMilestone — paired atomic writes', () => {
  it('creates a progress row with mastery_level AND one durable event row', async () => {
    await recordMilestone({
      kind: 'first_node_mastered',
      nodeId: 'node-a',
    });

    // Check materialized milestone state
    const progress = await getProgress('node-a');
    expect(progress).not.toBeNull();
    expect(progress!.masteryLevel).toBe(1); // first_node_mastered → level 1
    expect(progress!.nodeId).toBe('node-a');

    // Check durable event
    const events = await readDurableSince(0);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('first_node_mastered');
  });

  it('emits exactly ONE durable event per recordMilestone call', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'node-b' });
    await recordMilestone({ kind: 'first_domain_completed', nodeId: 'node-b' });

    const events = await readDurableSince(0);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('first_node_mastered');
    expect(events[1].kind).toBe('first_domain_completed');
  });

  it('durable event payload is the JSON-serialised detail', async () => {
    await recordMilestone({
      kind: 'first_node_mastered',
      nodeId: 'node-c',
      detail: { score: 100, attemptCount: 3 },
    });

    const events = await readDurableSince(0);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payload)).toEqual({ score: 100, attemptCount: 3 });
  });

  it('durable event payload is empty object when detail is absent', async () => {
    await recordMilestone({ kind: 'first_streak_reached', nodeId: 'node-d' });

    const events = await readDurableSince(0);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payload)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// (b) Failure injection — both-or-neither rollback
// ---------------------------------------------------------------------------

describe('recordMilestone — failure injection rollback (both-or-neither)', () => {
  it('rolls back BOTH the progress write AND the durable event on injected failure', async () => {
    // Inject a failure: runAsync throws when the first INSERT INTO durable_events
    // is issued. This happens after _writeMilestoneState has already been called
    // inside the same exclusive tx — proving that the ROLLBACK undoes Step 1 too.
    const restore = injectDurableInsertFailure();

    try {
      await expect(
        recordMilestone({ kind: 'first_node_mastered', nodeId: 'rollback-node' })
      ).rejects.toThrow('INJECTED FAILURE');
    } finally {
      restore();
    }

    // Assert: NO progress row was written (Step 1 rolled back with the tx)
    const progress = await getProgress('rollback-node');
    expect(progress).toBeNull();

    // Assert: NO durable event was written
    const events = await readDurableSince(0);
    expect(events).toHaveLength(0);
  });

  it('leaves the DB in a consistent state after rollback (subsequent calls still work)', async () => {
    // First call: fails and rolls back
    const restore = injectDurableInsertFailure();

    try {
      await expect(
        recordMilestone({ kind: 'first_node_mastered', nodeId: 'recovery-node' })
      ).rejects.toThrow();
    } finally {
      restore();
    }

    // Second call (normal): must succeed
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'recovery-node' });

    const progress = await getProgress('recovery-node');
    expect(progress).not.toBeNull();
    expect(progress!.masteryLevel).toBe(1);

    const events = await readDurableSince(0);
    expect(events).toHaveLength(1); // Only the successful call
  });
});

// ---------------------------------------------------------------------------
// (c) subscribeDurable listener receives the event after commit only
// ---------------------------------------------------------------------------

describe('recordMilestone — in-process pub/sub', () => {
  it('fires the listener exactly once after the tx commits', async () => {
    const received: DurableEvent[] = [];
    const unsub = subscribeDurable((e) => received.push(e));

    try {
      await recordMilestone({ kind: 'first_node_mastered', nodeId: 'pubsub-node' });
    } finally {
      unsub();
    }

    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe('first_node_mastered');
  });

  it('listener is NOT called when the transaction rolls back (injected failure)', async () => {
    const received: DurableEvent[] = [];
    const unsub = subscribeDurable((e) => received.push(e));

    const restore = injectDurableInsertFailure();

    try {
      await expect(
        recordMilestone({ kind: 'first_node_mastered', nodeId: 'no-pubsub-node' })
      ).rejects.toThrow();
    } finally {
      restore();
      unsub();
    }

    // Listener must NOT have been called — the tx rolled back before commit
    expect(received).toHaveLength(0);
  });

  it('unsubscribe stops the listener from receiving future events', async () => {
    const received: DurableEvent[] = [];
    const unsub = subscribeDurable((e) => received.push(e));

    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'unsub-node-1' });
    expect(received).toHaveLength(1);

    // Unsubscribe
    unsub();

    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'unsub-node-2' });
    // Should still be 1 — listener was unsubscribed
    expect(received).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (d) Firehose is NOT touched by the gate
// ---------------------------------------------------------------------------

describe('recordMilestone — firehose isolation', () => {
  it('does not write any firehose_events row', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'firehose-guard-node' });

    const firehose = await readAllFirehose();
    expect(firehose).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (e) Durable event carries sync-readiness fields
// ---------------------------------------------------------------------------

describe('recordMilestone — durable event sync-readiness fields', () => {
  it('emitted event carries a non-empty deviceId', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'sync-node-1' });
    const events = await readDurableSince(0);
    expect(typeof events[0].deviceId).toBe('string');
    expect(events[0].deviceId.length).toBeGreaterThan(0);
  });

  it('emitted events have strictly increasing seq', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'sync-node-2' });
    await recordMilestone({ kind: 'first_streak_reached', nodeId: 'sync-node-2' });

    const events = await readDurableSince(0);
    expect(events[0].seq).toBeGreaterThan(0);
    expect(events[1].seq).toBeGreaterThan(events[0].seq);
  });

  it('emitted event carries a positive createdAt epoch ms', async () => {
    const before = Date.now();
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'sync-node-3' });
    const after = Date.now();

    const events = await readDurableSince(0);
    expect(events[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(events[0].createdAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// (f) Anti-shame: mastery_level only increases via MAX
// ---------------------------------------------------------------------------

describe('recordMilestone — anti-shame mastery_level invariant', () => {
  it('mastery_level never decreases (MAX enforcement)', async () => {
    // First call: level 1
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'antishame-node' });
    const p1 = await getProgress('antishame-node');
    expect(p1!.masteryLevel).toBe(1);

    // Second call with same kind: level should stay 1 (MAX(1, 1) = 1)
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'antishame-node' });
    const p2 = await getProgress('antishame-node');
    expect(p2!.masteryLevel).toBe(1);

    // Third call with a higher-level kind
    await recordMilestone({ kind: 'first_domain_completed', nodeId: 'antishame-node' });
    const p3 = await getProgress('antishame-node');
    expect(p3!.masteryLevel).toBe(2); // MAX(1, 2) = 2

    // If we somehow call first_node_mastered again (level 1),
    // mastery_level must not drop back from 2
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'antishame-node' });
    const p4 = await getProgress('antishame-node');
    expect(p4!.masteryLevel).toBe(2); // MAX(2, 1) = 2 — no decrease
  });
});

// ---------------------------------------------------------------------------
// Barrel guard verification — structural enforcement proof
// ---------------------------------------------------------------------------

describe('Barrel guard — private helpers structurally unbypassable', () => {
  it('private helpers are NOT re-exported through the repositories barrel', () => {
    // _insertDurableEvent, _writeMilestoneState, and _emitDurable are module-local
    // non-exported functions in milestone-gate.ts. They cannot appear in any barrel.
    expect((repositoriesBarrel as any)['_insertDurableEvent']).toBeUndefined();
    expect((repositoriesBarrel as any)['_writeMilestoneState']).toBeUndefined();
    expect((repositoriesBarrel as any)['_emitDurable']).toBeUndefined();
  });

  it('events-repository does NOT export _insertDurableEvent', () => {
    // Belt-and-suspenders: verify the module itself does not export the helper.
    // If this test fails, Layer 1 (module privacy) has been broken.
    expect((eventsModule as any)['_insertDurableEvent']).toBeUndefined();
  });

  it('progress-repository does NOT export _writeMilestoneState', () => {
    // Belt-and-suspenders: verify the module itself does not export the helper.
    expect((progressModule as any)['_writeMilestoneState']).toBeUndefined();
  });

  it('milestone-gate does NOT export _emitDurable or _insertDurableEvent or _writeMilestoneState', () => {
    // The gate owns these as module-local functions — they must not appear in its exports.
    expect((milestoneGateModule as any)['_emitDurable']).toBeUndefined();
    expect((milestoneGateModule as any)['_insertDurableEvent']).toBeUndefined();
    expect((milestoneGateModule as any)['_writeMilestoneState']).toBeUndefined();
  });
});
