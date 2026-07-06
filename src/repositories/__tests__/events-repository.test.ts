/**
 * Tests for the events repository.
 *
 * Coverage (Phase 4 completion criteria):
 *   (a) appendFirehose succeeds outside any milestone tx
 *   (b) readDurableSince returns ordered events
 *   (c) every event carries deviceId + monotonic seq + createdAt
 *   (d) subscribeDurable fires after durable commits and respects unsubscribe
 *   (e) readAllFirehose returns firehose events in insertion order
 */

import { useTestDb } from '../../../jest.setup';
import { settings } from '../settings-repository';
import {
  appendFirehose,
  readDurableSince,
  readAllFirehose,
  subscribeDurable,
} from '../events-repository';
import { recordMilestone } from '../milestone-gate';
import type { DurableEvent } from '../../db/types';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// (a) appendFirehose — separate tx, outside milestone gate
// ---------------------------------------------------------------------------

describe('appendFirehose', () => {
  it('writes a row to firehose_events', async () => {
    await appendFirehose('attempt', { nodeId: 'node-x', correct: true });

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('attempt');
    expect(JSON.parse(rows[0].payload)).toEqual({ nodeId: 'node-x', correct: true });
  });

  it('writes multiple firehose rows independently', async () => {
    await appendFirehose('session_start', { nodeId: 'node-x' });
    await appendFirehose('answer', { nodeId: 'node-x', step: 1 });
    await appendFirehose('session_end', { nodeId: 'node-x' });

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(3);
    expect(rows[0].type).toBe('session_start');
    expect(rows[1].type).toBe('answer');
    expect(rows[2].type).toBe('session_end');
  });

  it('firehose is independent from durable events (different tables)', async () => {
    await appendFirehose('attempt', { step: 1 });
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'node-f' });

    const firehose = await readAllFirehose();
    const durable = await readDurableSince(0);

    // They are in separate tables
    expect(firehose).toHaveLength(1);
    expect(durable).toHaveLength(1);
    expect(firehose[0].type).toBe('attempt');
    expect(durable[0].kind).toBe('first_node_mastered');
  });
});

// ---------------------------------------------------------------------------
// (b) readDurableSince — ordered, filtered by seq
// ---------------------------------------------------------------------------

describe('readDurableSince', () => {
  it('returns all events when seq = 0', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'seq-node-1' });
    await recordMilestone({ kind: 'first_streak_reached', nodeId: 'seq-node-1' });

    const events = await readDurableSince(0);
    expect(events).toHaveLength(2);
  });

  it('returns only events with seq > given value', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'seq-node-2' });
    const all = await readDurableSince(0);
    const firstSeq = all[0].seq;

    await recordMilestone({ kind: 'first_streak_reached', nodeId: 'seq-node-2' });

    const later = await readDurableSince(firstSeq);
    expect(later).toHaveLength(1);
    expect(later[0].kind).toBe('first_streak_reached');
  });

  it('returns events ordered ascending by seq', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'order-node-1' });
    await recordMilestone({ kind: 'first_domain_completed', nodeId: 'order-node-2' });
    await recordMilestone({ kind: 'first_streak_reached', nodeId: 'order-node-3' });

    const events = await readDurableSince(0);
    expect(events).toHaveLength(3);
    expect(events[0].seq).toBeLessThan(events[1].seq);
    expect(events[1].seq).toBeLessThan(events[2].seq);
  });

  it('returns empty array when no events exist', async () => {
    const events = await readDurableSince(0);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (c) sync-readiness fields on every event
// ---------------------------------------------------------------------------

describe('Event sync-readiness fields', () => {
  it('durable event carries non-empty deviceId', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'sr-node-1' });
    const [event] = await readDurableSince(0);
    expect(typeof event.deviceId).toBe('string');
    expect(event.deviceId.length).toBeGreaterThan(0);
  });

  it('firehose event carries non-empty deviceId', async () => {
    await appendFirehose('attempt', {});
    const [event] = await readAllFirehose();
    expect(typeof event.deviceId).toBe('string');
    expect(event.deviceId.length).toBeGreaterThan(0);
  });

  it('durable events have strictly increasing seq', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'sr-node-2' });
    await recordMilestone({ kind: 'first_streak_reached', nodeId: 'sr-node-2' });

    const events = await readDurableSince(0);
    expect(events[1].seq).toBeGreaterThan(events[0].seq);
  });

  it('firehose events have strictly increasing seq', async () => {
    await appendFirehose('event-1', {});
    await appendFirehose('event-2', {});

    const events = await readAllFirehose();
    expect(events[1].seq).toBeGreaterThan(events[0].seq);
  });

  it('firehose and durable events share the same monotonic seq space', async () => {
    await appendFirehose('fire-first', {});
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'sr-shared' });
    await appendFirehose('fire-second', {});

    const firehose = await readAllFirehose();
    const durable = await readDurableSince(0);

    // All seqs across both tables should be distinct and increasing
    const allSeqs = [firehose[0].seq, durable[0].seq, firehose[1].seq].sort((a, b) => a - b);
    expect(allSeqs[0]).toBeLessThan(allSeqs[1]);
    expect(allSeqs[1]).toBeLessThan(allSeqs[2]);
  });

  it('every event carries a positive createdAt epoch ms', async () => {
    const before = Date.now();
    await appendFirehose('timed', {});
    const after = Date.now();

    const [event] = await readAllFirehose();
    expect(event.createdAt).toBeGreaterThanOrEqual(before);
    expect(event.createdAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// (d) subscribeDurable
// ---------------------------------------------------------------------------

describe('subscribeDurable', () => {
  it('calls listener when a durable event is committed via recordMilestone', async () => {
    const received: DurableEvent[] = [];
    const unsub = subscribeDurable((e) => received.push(e));

    try {
      await recordMilestone({ kind: 'first_node_mastered', nodeId: 'sub-node-1' });
    } finally {
      unsub();
    }

    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe('first_node_mastered');
  });

  it('does NOT call listener when appendFirehose is called', async () => {
    const received: DurableEvent[] = [];
    const unsub = subscribeDurable((e) => received.push(e));

    try {
      await appendFirehose('some-event', { x: 1 });
    } finally {
      unsub();
    }

    expect(received).toHaveLength(0);
  });

  it('multiple listeners all receive the same event', async () => {
    const received1: DurableEvent[] = [];
    const received2: DurableEvent[] = [];

    const unsub1 = subscribeDurable((e) => received1.push(e));
    const unsub2 = subscribeDurable((e) => received2.push(e));

    try {
      await recordMilestone({ kind: 'first_node_mastered', nodeId: 'multi-sub' });
    } finally {
      unsub1();
      unsub2();
    }

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0].id).toBe(received2[0].id);
  });

  it('unsubscribed listener does not receive subsequent events', async () => {
    const received: DurableEvent[] = [];
    const unsub = subscribeDurable((e) => received.push(e));

    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'unsub-sub-1' });
    expect(received).toHaveLength(1);

    unsub();

    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'unsub-sub-2' });
    // Still 1 — listener was removed
    expect(received).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (e) readAllFirehose
// ---------------------------------------------------------------------------

describe('readAllFirehose', () => {
  it('returns rows in insertion order (ascending id)', async () => {
    await appendFirehose('first', { n: 1 });
    await appendFirehose('second', { n: 2 });
    await appendFirehose('third', { n: 3 });

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(3);
    expect(rows[0].type).toBe('first');
    expect(rows[1].type).toBe('second');
    expect(rows[2].type).toBe('third');
  });

  it('returns empty array when firehose table is empty', async () => {
    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });
});
