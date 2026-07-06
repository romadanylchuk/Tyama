/**
 * Firehose compaction — pure decision function + scoped apply method.
 *
 * SHIPPED DISARMED:
 * The default retention policy (src/config/retention.ts) ships with enabled:false.
 * When disabled, decideCompaction() always returns [] and applyCompaction() returns 0
 * without a single DB read. No compaction runs in MVP unless the policy is armed.
 *
 * DURABLE IMMUNITY — STRUCTURAL ENFORCEMENT:
 * applyCompaction() operates ONLY on the `firehose_events` table.
 * The word "durable_events" does NOT appear in any SQL string in this file.
 * The durable table is immune by construction — not by policy or runtime check,
 * but because the SQL never references it. The guardrail test in
 * src/repositories/__tests__/compaction.test.ts proves this even when armed.
 *
 * PURE DECISION FUNCTION:
 * decideCompaction(rows, policy, now) is a PURE function — same inputs → same output,
 * no side effects, no DB access. It can be tested deterministically in isolation.
 * The pure fn and the DB apply method are deliberately separate:
 *   pure fn → decides which IDs to drop
 *   apply   → executes the deletions (impure; touches firehose_events only)
 *
 * COMPACTION ELIGIBILITY RULES (both conditions are OR-joined):
 *   Age rule:   created_at < (now - maxAgeDays * MS_PER_DAY)
 *   Count rule: the row is among the oldest rows beyond maxRows (count-based pruning)
 * The union of both sets of ids is what gets dropped.
 *
 * RETENTION POLICY:
 * See src/config/retention.ts for the RetentionPolicy interface and shipped defaults.
 */

import { getDb } from '@/db/database';
import type { FirehoseEvent } from '@/db/types';
import { RETENTION_POLICY, type RetentionPolicy } from '@/config/retention';

export type { RetentionPolicy } from '@/config/retention';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Raw DB row type (for internal reads only)
// ---------------------------------------------------------------------------

interface RawFirehoseRow {
  id: number;
  type: string;
  payload: string;
  device_id: string;
  seq: number;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Pure decision function
// ---------------------------------------------------------------------------

/**
 * Decide which firehose event IDs should be deleted given the current policy.
 *
 * PURE FUNCTION — no side effects, no DB access, deterministic.
 *
 * Returns an array of `id` values to delete.
 * Returns [] when policy.enabled === false.
 * Returns [] when no rows violate either retention rule.
 *
 * Eligibility rules:
 *   1. Age: created_at < (now - maxAgeDays * MS_PER_DAY)
 *   2. Count: oldest rows beyond maxRows (rows are assumed sorted by id ASC)
 *
 * @param rows   All current firehose rows, sorted by id ASC (insertion order).
 * @param policy The retention policy to apply.
 * @param now    Current wall-clock time as epoch ms.
 * @returns      Array of row IDs that should be deleted. May be empty.
 */
export function decideCompaction(
  rows: FirehoseEvent[],
  policy: RetentionPolicy,
  now: number
): number[] {
  // Fast path: disabled policy → no deletions.
  if (!policy.enabled) {
    return [];
  }

  const eligible = new Set<number>();

  // Rule 1 — Age: rows older than maxAgeDays are eligible.
  const ageThreshold = now - policy.maxAgeDays * MS_PER_DAY;
  for (const row of rows) {
    if (row.createdAt < ageThreshold) {
      eligible.add(row.id);
    }
  }

  // Rule 2 — Count: if total rows > maxRows, oldest rows beyond the limit are eligible.
  if (rows.length > policy.maxRows) {
    const excess = rows.length - policy.maxRows;
    // rows is sorted by id ASC, so the first `excess` entries are the oldest.
    for (let i = 0; i < excess; i++) {
      eligible.add(rows[i].id);
    }
  }

  return Array.from(eligible);
}

// ---------------------------------------------------------------------------
// Impure apply method (firehose-only, never touches durable_events)
// ---------------------------------------------------------------------------

/**
 * Apply compaction to the firehose_events table.
 *
 * Steps:
 *   1. If policy.enabled is false → return 0 immediately (no DB read).
 *   2. Read all firehose rows (id + created_at, ordered by id ASC).
 *   3. Run decideCompaction() to find which IDs to drop.
 *   4. Delete only those IDs from firehose_events — NEVER from durable_events.
 *   5. Return the count of deleted rows.
 *
 * DURABLE IMMUNITY: The SQL in this function reads and deletes ONLY from
 * `firehose_events`. The `durable_events` table is NOT referenced here at all.
 * This is a structural guarantee, not a runtime check.
 *
 * @param policy The retention policy to apply. Defaults to the shipped RETENTION_POLICY.
 * @param now    Current wall-clock time as epoch ms. Defaults to Date.now().
 * @returns      The number of firehose rows deleted. 0 if disabled or nothing eligible.
 */
export async function applyCompaction(
  policy: RetentionPolicy = RETENTION_POLICY,
  now: number = Date.now()
): Promise<number> {
  // Fast path: disabled → no DB access at all.
  if (!policy.enabled) {
    return 0;
  }

  const db = getDb();

  // Read all firehose rows for decision-making (ordered by id ASC = insertion order).
  // NOTE: this reads ONLY firehose_events — durable_events is never touched.
  const rawRows = await db.getAllAsync<RawFirehoseRow>(
    'SELECT id, type, payload, device_id, seq, created_at FROM firehose_events ORDER BY id ASC'
  );

  // Map to FirehoseEvent (the pure fn expects this shape).
  const rows: FirehoseEvent[] = rawRows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: r.payload,
    deviceId: r.device_id,
    seq: r.seq,
    createdAt: r.created_at,
  }));

  // Pure decision step.
  const toDelete = decideCompaction(rows, policy, now);

  if (toDelete.length === 0) {
    return 0;
  }

  // Delete ONLY from firehose_events. One DELETE per batch for simplicity
  // (MVP-scale firehose; a chunked approach can be added as a data change later).
  // IMPORTANT: durable_events is NOT referenced anywhere below.
  const placeholders = toDelete.map(() => '?').join(', ');
  await db.runAsync(
    `DELETE FROM firehose_events WHERE id IN (${placeholders})`,
    ...toDelete
  );

  return toDelete.length;
}
