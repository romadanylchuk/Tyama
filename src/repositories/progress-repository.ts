/**
 * Progress repository — materialized read-authority for skill-graph node progress.
 *
 * PUBLIC API (exported, safe to import anywhere):
 *   getProgress(nodeId)             — read one progress row
 *   getDueNodes(now)                — due-queue read via partial index on due_at
 *   upsertNonMilestoneProgress(...) — update streak/xp/dueAt/metrics
 *                                     NEVER touches mastery_level (milestone gate only)
 *
 * STRUCTURAL ENFORCEMENT:
 *   The milestone-state mutator (_writeMilestoneState) has been moved into
 *   milestone-gate.ts as a truly module-local (non-exported) function. It cannot
 *   be imported from any other module. This realizes the "impossible by construction"
 *   invariant from D2 of the interview brief: the only path that can mutate
 *   mastery_level in the progress table is recordMilestone() in milestone-gate.ts.
 *
 * ANTI-SHAME INVARIANT:
 *   mastery_level is an INTEGER ordinal that only ever increases or holds.
 *   upsertNonMilestoneProgress() explicitly excludes mastery_level from its UPDATE.
 *   The milestone-gate's _writeMilestoneState() enforces the increase-or-hold rule
 *   via MAX(mastery_level, ?).
 *
 * SENTINEL NODE IDS:
 *   For milestone kinds that do not map to a skill-graph node, recordMilestone()
 *   synthesises a sentinel node_id of the form `__milestone_<kind>__`. These rows
 *   are NOT real skill-graph nodes. getDueNodes() filters them out via a
 *   WHERE node_id NOT LIKE '__milestone_%' guard so the spaced-repetition queue
 *   never surfaces non-task sentinels.
 */

import { getDb } from '@/db/database';
import { runRelaxed } from '@/db/tx';
import type { NodeId, ProgressRow } from '@/db/types';

// ---------------------------------------------------------------------------
// Row shape returned from the DB (snake_case from SQLite)
// ---------------------------------------------------------------------------

interface RawProgressRow {
  node_id: string;
  mastery_level: number;
  streak: number;
  xp: number;
  due_at: number | null;
  metrics: string;
  updated_at: number;
}

function rowFromRaw(raw: RawProgressRow): ProgressRow {
  return {
    nodeId: raw.node_id,
    masteryLevel: raw.mastery_level,
    streak: raw.streak,
    xp: raw.xp,
    dueAt: raw.due_at,
    metrics: raw.metrics,
    updatedAt: raw.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Public read API
// ---------------------------------------------------------------------------

/**
 * Return the progress row for a single node, or null if not yet started.
 */
export async function getProgress(nodeId: NodeId): Promise<ProgressRow | null> {
  const db = getDb();
  const raw = await db.getFirstAsync<RawProgressRow>(
    'SELECT node_id, mastery_level, streak, xp, due_at, metrics, updated_at FROM progress WHERE node_id = ?',
    nodeId
  );
  return raw ? rowFromRaw(raw) : null;
}

/**
 * Return all progress rows where due_at IS NOT NULL AND due_at <= now,
 * ordered ascending by due_at (most overdue first).
 *
 * Uses the partial index idx_progress_due for efficiency.
 * Scheduling logic is stage 05; this is only the stored-shape + ordered read.
 *
 * SENTINEL FILTER: rows whose node_id matches the `__milestone_%` pattern are
 * synthetic sentinel rows created by the milestone gate for domain/streak milestones.
 * They are not real skill-graph nodes and must never appear in the spaced-repetition
 * queue. The WHERE clause below filters them out unconditionally.
 */
export async function getDueNodes(now: number): Promise<ProgressRow[]> {
  const db = getDb();
  const rows = await db.getAllAsync<RawProgressRow>(
    `SELECT node_id, mastery_level, streak, xp, due_at, metrics, updated_at
     FROM progress
     WHERE due_at IS NOT NULL
       AND due_at <= ?
       AND node_id NOT LIKE '__milestone_%'
     ORDER BY due_at ASC`,
    now
  );
  return rows.map(rowFromRaw);
}

// ---------------------------------------------------------------------------
// Public non-milestone mutation
// ---------------------------------------------------------------------------

/**
 * Upsert non-milestone progress fields (streak, xp, dueAt, metrics) for a node.
 *
 * NEVER touches mastery_level — that field belongs exclusively to the milestone
 * gate (recordMilestone in milestone-gate.ts). Enforced structurally: the
 * UPDATE statement below omits mastery_level, and the INSERT default is 0.
 *
 * Uses a relaxed (deferred) transaction — performance is acceptable for the
 * firehose-style per-answer progress updates this function serves.
 *
 * DUE_AT SEMANTICS:
 *   - If 'dueAt' key is absent from the row argument: COALESCE preserves the
 *     existing due_at value (no-op for scheduling).
 *   - If 'dueAt' key is present (even if null): the value is written directly,
 *     allowing the caller to explicitly clear due_at back to NULL (stage 05
 *     spaced-repetition scheduler needs this to un-schedule a node).
 */
export async function upsertNonMilestoneProgress(
  row: Partial<ProgressRow> & { nodeId: NodeId }
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const dueAtSupplied = 'dueAt' in row;

  await runRelaxed(db, async () => {
    const existing = await db.getFirstAsync<RawProgressRow>(
      'SELECT node_id FROM progress WHERE node_id = ?',
      row.nodeId
    );

    if (existing) {
      if (dueAtSupplied) {
        // due_at key was explicitly provided (possibly null) — write it directly
        // so callers can clear it back to NULL (stage 05 un-scheduling).
        await db.runAsync(
          `UPDATE progress
           SET streak     = COALESCE(?, streak),
               xp         = COALESCE(?, xp),
               due_at     = ?,
               metrics    = COALESCE(?, metrics),
               updated_at = ?
           WHERE node_id = ?`,
          row.streak ?? null,
          row.xp ?? null,
          row.dueAt ?? null,
          row.metrics ?? null,
          now,
          row.nodeId
        );
      } else {
        // due_at key absent — omit due_at from SET entirely to preserve existing value.
        await db.runAsync(
          `UPDATE progress
           SET streak     = COALESCE(?, streak),
               xp         = COALESCE(?, xp),
               metrics    = COALESCE(?, metrics),
               updated_at = ?
           WHERE node_id = ?`,
          row.streak ?? null,
          row.xp ?? null,
          row.metrics ?? null,
          now,
          row.nodeId
        );
      }
    } else {
      // INSERT omitting mastery_level — the schema DEFAULT 0 applies.
      // mastery_level must NEVER be set by upsertNonMilestoneProgress; only
      // recordMilestone() in milestone-gate.ts may write that column.
      await db.runAsync(
        `INSERT INTO progress (node_id, streak, xp, due_at, metrics, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        row.nodeId,
        row.streak ?? 0,
        row.xp ?? 0,
        dueAtSupplied ? (row.dueAt ?? null) : null,
        row.metrics ?? '{}',
        now
      );
    }
  });
}
