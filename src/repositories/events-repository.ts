/**
 * Events repository — durable event feed + firehose append path.
 *
 * PUBLIC API:
 *   appendFirehose(type, payload) — append a high-volume behavioral event.
 *                                   Uses a SEPARATE relaxed (deferred) tx.
 *                                   NEVER inside the milestone gate tx.
 *   readDurableSince(seq)         — query durable events with seq > given value.
 *                                   Used for replay / late consumers.
 *   subscribeDurable(listener)    — re-exported from milestone-gate (owner of
 *                                   the in-process pub/sub state). Returns an
 *                                   unsubscribe fn.
 *
 * STRUCTURAL ENFORCEMENT:
 *   The private helpers (_insertDurableEvent, _emitDurable, _writeMilestoneState)
 *   have been moved into milestone-gate.ts as truly module-local (non-exported)
 *   functions. They are not accessible from outside that module at all — no import
 *   path can reach them. This makes the "impossible by construction" invariant (D2)
 *   structurally real.
 *
 * SYNC-READINESS:
 *   Every event row carries deviceId + seq (logical clock) + createdAt for
 *   eventual sync. Stamped here at write time via device-id and logical-clock.
 *
 * ACTIVITY-EVENT-STREAM CONTRACT:
 *   The durable class is the subscribable feed. Producers (stage 04/06) and
 *   consumers (companion/social, deferred) bind via subscribeDurable without
 *   a core rewrite. No external bus — in-process emitter only for MVP.
 */

import { getDb } from '@/db/database';
import { runRelaxed } from '@/db/tx';
import { getDeviceId } from '@/device/device-id';
import { nextSeq } from '@/device/logical-clock';
import type { DurableEvent, FirehoseEvent, MilestoneKind } from '@/db/types';

// Re-export subscribeDurable from the milestone-gate module, which owns the
// in-process listener state (_listeners) and _emitDurable.
export { subscribeDurable } from './milestone-gate';

// ---------------------------------------------------------------------------
// Raw DB row shapes
// ---------------------------------------------------------------------------

interface RawDurableRow {
  id: number;
  kind: string;
  payload: string;
  device_id: string;
  seq: number;
  created_at: number;
}

interface RawFirehoseRow {
  id: number;
  type: string;
  payload: string;
  device_id: string;
  seq: number;
  created_at: number;
}

function durableFromRaw(raw: RawDurableRow): DurableEvent {
  return {
    id: raw.id,
    kind: raw.kind as MilestoneKind,
    payload: raw.payload,
    deviceId: raw.device_id,
    seq: raw.seq,
    createdAt: raw.created_at,
  };
}

function firehoseFromRaw(raw: RawFirehoseRow): FirehoseEvent {
  return {
    id: raw.id,
    type: raw.type,
    payload: raw.payload,
    deviceId: raw.device_id,
    seq: raw.seq,
    createdAt: raw.created_at,
  };
}

// ---------------------------------------------------------------------------
// PUBLIC: firehose append (relaxed tx, SEPARATE from milestone gate)
// ---------------------------------------------------------------------------

/**
 * Append a high-volume behavioral event (attempt, answer, navigation, etc.)
 * to the firehose_events table.
 *
 * Uses a RELAXED (deferred) transaction — firehose ordering guarantees are
 * acceptable-loss. This function MUST NOT be called inside the milestone gate's
 * exclusive transaction (performance footgun — enforced structurally by the fact
 * that the milestone gate only has access to its own module-local helpers).
 *
 * @param type    Semantic event type (e.g. 'attempt', 'answer', 'session_start').
 * @param payload Structured payload (will be JSON-serialized).
 */
export async function appendFirehose(type: string, payload: unknown): Promise<void> {
  const db = getDb();
  const deviceId = await getDeviceId();
  const seq = await nextSeq();
  const createdAt = Date.now();
  const payloadJson = JSON.stringify(payload);

  await runRelaxed(db, async () => {
    await db.runAsync(
      `INSERT INTO firehose_events (type, payload, device_id, seq, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      type,
      payloadJson,
      deviceId,
      seq,
      createdAt
    );
  });
}

// ---------------------------------------------------------------------------
// PUBLIC: durable event read feed (replay / late consumer)
// ---------------------------------------------------------------------------

/**
 * Return all durable events with seq strictly greater than the given value,
 * ordered ascending by seq.
 *
 * Suitable for late consumers that need to replay the history from a known
 * position. For real-time, use subscribeDurable().
 *
 * @param seq The last-seen logical sequence number. Pass 0 to read all events.
 */
export async function readDurableSince(seq: number): Promise<DurableEvent[]> {
  const db = getDb();
  const rows = await db.getAllAsync<RawDurableRow>(
    `SELECT id, kind, payload, device_id, seq, created_at
     FROM durable_events
     WHERE seq > ?
     ORDER BY seq ASC`,
    seq
  );
  return rows.map(durableFromRaw);
}

// ---------------------------------------------------------------------------
// PUBLIC: firehose read (for compaction and backup — not in the hot path)
// ---------------------------------------------------------------------------

/**
 * Return all firehose events, ordered ascending by id (creation order).
 * Used by compaction (stage 05) and backup (stage 06).
 */
export async function readAllFirehose(): Promise<FirehoseEvent[]> {
  const db = getDb();
  const rows = await db.getAllAsync<RawFirehoseRow>(
    'SELECT id, type, payload, device_id, seq, created_at FROM firehose_events ORDER BY id ASC'
  );
  return rows.map(firehoseFromRaw);
}
