/**
 * Milestone gate — the SOLE path that writes materialized milestone state.
 *
 * CONTRACT:
 *   recordMilestone(payload) — atomically persists BOTH:
 *     1. the materialized milestone state (mastery_level on the progress row), AND
 *     2. the durable event (durable_events row with deviceId + seq + createdAt)
 *   in a SINGLE withExclusiveTransactionAsync call.
 *
 *   After commit, fires all in-process durable listeners via _emitDurable (module-local).
 *
 *   The firehose is NEVER touched here. Firehose appends are a separate
 *   relaxed transaction (see events-repository.ts:appendFirehose).
 *
 * STRUCTURAL ENFORCEMENT (layered defence-in-depth):
 *   Layer 1 — Module privacy: the milestone-state writer (_writeMilestoneState) and
 *     the durable-event inserter (_insertDurableEvent) and the post-commit emitter
 *     (_emitDurable) are ALL module-local (non-exported) functions defined below.
 *     They are NOT exported by this file and therefore are not importable by any
 *     other module at all — they are structurally unbypassable.
 *   Layer 2 — Barrel guard: only recordMilestone is re-exported from index.ts;
 *     the private helpers are NOT listed there.
 *   Layer 3 — ESLint rule: no-direct-milestone-mutation flags SQL touching
 *     progress.mastery_level or durable_events outside this file. This file is
 *     exempt (see eslint.config.js).
 *   Layer 4 — Guardrail tests: milestone-gate.test.ts proves that the gate always
 *     pairs writes, and that an injected failure rolls back both atomically.
 *
 * ATOMICITY MODEL:
 *   BEGIN EXCLUSIVE → _writeMilestoneState (progress UPDATE/INSERT) →
 *                  → _insertDurableEvent (durable_events INSERT) →
 *   COMMIT → _emitDurable (post-commit, in-process only)
 *
 *   Any throw inside the tx body causes ROLLBACK — neither the state update
 *   nor the event row persists. This is the "both-or-neither" guarantee.
 *
 * PAYLOAD SHAPE:
 *   MilestonePayload.kind drives which mastery level to apply and which event
 *   kind to emit. The discriminated union is closed — add variants to
 *   MilestoneKind + MilestonePayload in types.ts; never use raw strings here.
 *
 * SENTINEL NODE IDS:
 *   For milestone kinds that do not correspond to a skill-graph node
 *   (first_domain_completed, first_streak_reached), if nodeId is not supplied,
 *   a synthetic sentinel id of the form `__milestone_<kind>__` is used to store
 *   the progress row. These are NOT real skill-graph nodes and are explicitly
 *   filtered out of getDueNodes() (see progress-repository.ts). The convention
 *   is documented here so it can be recognised if it appears in raw DB queries.
 */

import { getDb } from '@/db/database';
import { runExclusive } from '@/db/tx';
import { getDeviceId } from '@/device/device-id';
import { nextSeq } from '@/device/logical-clock';
import type { MilestonePayload, DurableEvent, NodeId, MasteryLevel, MilestoneKind } from '@/db/types';

// ---------------------------------------------------------------------------
// In-process pub/sub for the durable feed (module-local, not exported)
// ---------------------------------------------------------------------------

type DurableListener = (event: DurableEvent) => void;
const _listeners = new Set<DurableListener>();

/**
 * Subscribe to durable events emitted after commit.
 * EXPORTED — consumed by events-repository.ts subscribers via re-export.
 * Module-local state (_listeners) is owned here.
 */
export function subscribeDurable(listener: DurableListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Module-local helpers — NOT exported, NOT importable by any other module
// ---------------------------------------------------------------------------

/**
 * Fire all registered durable listeners post-commit.
 *
 * MODULE-LOCAL — called ONLY from recordMilestone() AFTER the exclusive tx
 * commits (not inside it). Fires synchronously through all registered listeners.
 * Listener errors are caught and logged (non-fatal: the event is already persisted).
 */
function _emitDurable(event: DurableEvent): void {
  for (const listener of _listeners) {
    try {
      listener(event);
    } catch (e) {
      // Listener errors must not propagate back to the gate caller.
      // The event is already persisted at this point.
      console.error('[milestone-gate] durable listener error:', e);
    }
  }
}

/**
 * Write milestone state for a node inside an already-open exclusive transaction.
 *
 * MODULE-LOCAL — not exported. Only recordMilestone() calls this, inside the
 * exclusive tx it owns. No other module can reach this function.
 *
 * Anti-shame enforcement:
 *   Uses MAX(mastery_level, ?) so the level only ever increases.
 *   If the node row does not yet exist, inserts it with the given mastery_level.
 *
 * @param txn          The transaction-scoped DB object from withExclusiveTransactionAsync.
 * @param nodeId       The node to update.
 * @param masteryLevel The new mastery level (must be >= current; enforced by MAX).
 */
async function _writeMilestoneState(
  txn: import('expo-sqlite').SQLiteDatabase,
  nodeId: NodeId,
  masteryLevel: MasteryLevel
): Promise<void> {
  const now = Date.now();

  const existing = await txn.getFirstAsync<{ node_id: string }>(
    'SELECT node_id FROM progress WHERE node_id = ?',
    nodeId
  );

  if (existing) {
    // Anti-shame: use MAX so mastery_level can only increase.
    await txn.runAsync(
      `UPDATE progress
       SET mastery_level = MAX(mastery_level, ?),
           updated_at    = ?
       WHERE node_id = ?`,
      masteryLevel,
      now,
      nodeId
    );
  } else {
    // First-ever progress row for this node.
    await txn.runAsync(
      `INSERT INTO progress (node_id, mastery_level, streak, xp, due_at, metrics, updated_at)
       VALUES (?, ?, 0, 0, NULL, '{}', ?)`,
      nodeId,
      masteryLevel,
      now
    );
  }
}

/**
 * Insert a durable event row inside an already-open exclusive transaction.
 *
 * MODULE-LOCAL — not exported. Only recordMilestone() calls this, inside the
 * exclusive tx it owns. No other module can reach this function.
 *
 * @param txn       Transaction-scoped DB object from withExclusiveTransactionAsync.
 * @param kind      The milestone kind (discriminated union tag).
 * @param payload   JSON string of the serialized MilestonePayload.detail.
 * @param deviceId  Stamped sync-readiness field.
 * @param seq       Monotonic logical clock value (from nextSeq()).
 * @param createdAt Wall-clock epoch ms.
 * @returns         The autoincrement id of the inserted row.
 */
async function _insertDurableEvent(
  txn: import('expo-sqlite').SQLiteDatabase,
  kind: MilestoneKind,
  payload: string,
  deviceId: string,
  seq: number,
  createdAt: number
): Promise<number> {
  const result = await txn.runAsync(
    `INSERT INTO durable_events (kind, payload, device_id, seq, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    kind,
    payload,
    deviceId,
    seq,
    createdAt
  );
  return result.lastInsertRowId;
}

// ---------------------------------------------------------------------------
// Mastery level mapping (closed by MilestoneKind)
// ---------------------------------------------------------------------------

/**
 * Map each milestone kind to the mastery_level ordinal it signals.
 *
 * This is config-as-data: the mapping ships with working defaults; pedagogy-pass
 * (stage later) calibrates the values as data without a code change.
 *
 * Ordinals are additive steps; 1 = first mastery, 2 = domain completion, etc.
 * Keep in sync with the mastery-gate design in stage 04 once that ships.
 *
 * Typed as Record<MilestoneKind, number> for compile-time exhaustiveness: adding
 * a new MilestoneKind without updating this map will produce a TS error.
 */
const MILESTONE_MASTERY_LEVEL: Record<MilestoneKind, number> = {
  first_node_mastered: 1,
  first_domain_completed: 2,
  first_streak_reached: 1,
};

function masteryLevelForKind(kind: MilestoneKind): number {
  return MILESTONE_MASTERY_LEVEL[kind];
}

// ---------------------------------------------------------------------------
// Public API — the single narrow gate
// ---------------------------------------------------------------------------

/**
 * Record a milestone event atomically.
 *
 * Writes BOTH the materialized milestone state AND the durable event in one
 * exclusive transaction. On any failure, BOTH writes roll back (both-or-neither).
 *
 * The firehose is intentionally NOT touched here. The caller may append a
 * separate firehose event AFTER this call if desired, via appendFirehose().
 *
 * @param payload Closed discriminated union payload (MilestonePayload).
 *                nodeId is required for 'first_node_mastered'.
 *                For 'first_domain_completed'/'first_streak_reached', if nodeId
 *                is absent, a synthetic sentinel id `__milestone_<kind>__` is used.
 *                Sentinel rows are filtered from getDueNodes() by design.
 */
export async function recordMilestone(payload: MilestonePayload): Promise<void> {
  const db = getDb();

  // Stamp sync-readiness fields BEFORE opening the tx so we don't hold the
  // exclusive lock while doing async settings reads.
  const deviceId = await getDeviceId();
  const seq = await nextSeq();
  const createdAt = Date.now();

  // Serialize the detail payload (or empty object if absent).
  const payloadJson = JSON.stringify(payload.detail ?? {});

  // The node to apply milestone state to. For 'first_node_mastered' this is
  // the node; for 'first_domain_completed'/'first_streak_reached' it may be
  // a synthetic sentinel id if nodeId is not supplied. Sentinel ids follow the
  // convention __milestone_<kind>__ and are filtered from getDueNodes().
  const nodeId = payload.nodeId ?? `__milestone_${payload.kind}__`;
  const masteryLevel = masteryLevelForKind(payload.kind);

  // insertedId is typed number (not number|null) and initialized to 0.
  // runExclusive resolves only on success; if it throws, we never reach the
  // post-commit block. So insertedId is guaranteed to hold the real id here.
  let insertedId = 0;

  await runExclusive(db, async (txn) => {
    // Step 1: materialize milestone state on the progress row.
    // _writeMilestoneState uses MAX(mastery_level, ?) — anti-shame invariant.
    await _writeMilestoneState(txn, nodeId, masteryLevel);

    // Step 2: insert the durable event in the same tx.
    // Both-or-neither: if this throws, Step 1 also rolls back.
    insertedId = await _insertDurableEvent(
      txn,
      payload.kind,
      payloadJson,
      deviceId,
      seq,
      createdAt
    );
  });

  // Post-commit: fire in-process listeners with the fully committed event.
  // We reconstruct the DurableEvent from the values we stamped above.
  // insertedId is guaranteed non-zero here (runExclusive committed successfully).
  const committed: DurableEvent = {
    id: insertedId,
    kind: payload.kind,
    payload: payloadJson,
    deviceId,
    seq,
    createdAt,
  };
  _emitDurable(committed);
}
