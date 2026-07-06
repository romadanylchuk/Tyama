/**
 * Graph-migration repository — declarative node-identity mastery-migration applier.
 *
 * PURPOSE:
 * When the skill graph evolves between app versions (stage 02+), node IDs may be
 * renamed, split, merged, or deprecated. This applier consumes a declarative list
 * of GraphMigrationOp values and propagates mastery forward with ANTI-SHAME semantics:
 * mastery_level can only increase or hold — it NEVER decreases as a result of a migration.
 *
 * VERSION AXIS:
 * This is the graph-content axis (keyed by graphVersion semver, stage 02+).
 * It is ENTIRELY SEPARATE from the DB-schema axis (PRAGMA user_version, runMigrations).
 * applyGraphMigrations() NEVER reads or writes PRAGMA user_version.
 * Startup order: schema migrations (runMigrations) FIRST, then graph migrations
 * (applyGraphMigrations) SECOND.
 *
 * DEFAULT / STAGE 01 BEHAVIOUR:
 * Stage 01 ships an EMPTY ops list — applyGraphMigrations([]) is a documented no-op.
 * Stage 02 supplies the first real ops when it commits an initial graphVersion.
 *
 * ANTI-SHAME PROPAGATION RULES (DL-6):
 *   rename    → the new node carries the source mastery unchanged.
 *   split     → ALL child nodes get max(child_existing, source_mastery). Never reduce.
 *   merge     → the resulting node gets max(all sources' mastery). Never reduce.
 *   deprecate → the source row is retired (deleted from progress). No survivor is touched.
 *
 * EACH OP RUNS INSIDE ONE EXCLUSIVE TRANSACTION:
 * If any op throws, the transaction for that op rolls back and the error propagates.
 * Ops are applied in array order; if the list is empty the function returns immediately.
 *
 * STRUCTURAL NOTE:
 * This module does NOT re-export or depend on _writeMilestoneState from milestone-gate.
 * It issues its own `MAX(mastery_level, ?)` guarded SQL directly inside its own
 * exclusive transactions — this is legitimate and distinct from the milestone-gate path
 * (which writes durable events atomically). Graph migrations are silent data reshaping
 * and do not emit durable events; they operate at the graph-versioning layer.
 */

import { getDb } from '@/db/database';
import { runExclusive } from '@/db/tx';
import type { NodeId, MasteryLevel } from '@/db/types';
import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Discriminated union of the four supported graph migration operations.
 *
 * op: 'rename'    — fromId no longer exists; toId inherits its mastery.
 * op: 'split'     — fromId is replaced by multiple toIds, each getting ≥ source mastery.
 * op: 'merge'     — multiple fromIds collapse into one toId; toId gets the max mastery.
 * op: 'deprecate' — fromId is retired; no successor; no mastery redistributed.
 */
export type GraphMigrationOp =
  | { op: 'rename'; from: NodeId; to: NodeId }
  | { op: 'split'; from: NodeId; to: NodeId[] }
  | { op: 'merge'; from: NodeId[]; to: NodeId }
  | { op: 'deprecate'; from: NodeId };

// ---------------------------------------------------------------------------
// Internal helper: read mastery_level for a node (0 if row absent)
// ---------------------------------------------------------------------------

interface RawMasteryRow {
  mastery_level: number;
}

async function getMasteryLevel(txn: SQLiteDatabase, nodeId: NodeId): Promise<MasteryLevel> {
  const row = await txn.getFirstAsync<RawMasteryRow>(
    'SELECT mastery_level FROM progress WHERE node_id = ?',
    nodeId
  );
  return row?.mastery_level ?? 0;
}

// ---------------------------------------------------------------------------
// Internal op handlers — each runs inside a caller-supplied exclusive tx
// ---------------------------------------------------------------------------

/**
 * RENAME: carry mastery from `from` to `to`.
 * Anti-shame: `to` node gets MAX(to_existing, from_mastery).
 * The `from` row is deleted after the carry.
 */
async function applyRename(
  txn: SQLiteDatabase,
  from: NodeId,
  to: NodeId
): Promise<void> {
  const sourceMastery = await getMasteryLevel(txn, from);
  const now = Date.now();

  // Ensure `to` row exists with at least the source mastery (MAX guards the update).
  const toExists = await txn.getFirstAsync<{ node_id: string }>(
    'SELECT node_id FROM progress WHERE node_id = ?',
    to
  );

  if (toExists) {
    await txn.runAsync(
      `UPDATE progress
       SET mastery_level = MAX(mastery_level, ?),
           updated_at    = ?
       WHERE node_id = ?`,
      sourceMastery,
      now,
      to
    );
  } else {
    await txn.runAsync(
      `INSERT INTO progress (node_id, mastery_level, streak, xp, due_at, metrics, updated_at)
       VALUES (?, ?, 0, 0, NULL, '{}', ?)`,
      to,
      sourceMastery,
      now
    );
  }

  // Retire the source row.
  await txn.runAsync('DELETE FROM progress WHERE node_id = ?', from);
}

/**
 * SPLIT: `from` is replaced by all nodes in `to[]`.
 * Anti-shame: EACH child gets MAX(child_existing, source_mastery). Never reduce.
 * The source row is deleted after propagation to all children.
 */
async function applySplit(
  txn: SQLiteDatabase,
  from: NodeId,
  toIds: NodeId[]
): Promise<void> {
  const sourceMastery = await getMasteryLevel(txn, from);
  const now = Date.now();

  for (const childId of toIds) {
    const childExists = await txn.getFirstAsync<{ node_id: string }>(
      'SELECT node_id FROM progress WHERE node_id = ?',
      childId
    );

    if (childExists) {
      await txn.runAsync(
        `UPDATE progress
         SET mastery_level = MAX(mastery_level, ?),
             updated_at    = ?
         WHERE node_id = ?`,
        sourceMastery,
        now,
        childId
      );
    } else {
      await txn.runAsync(
        `INSERT INTO progress (node_id, mastery_level, streak, xp, due_at, metrics, updated_at)
         VALUES (?, ?, 0, 0, NULL, '{}', ?)`,
        childId,
        sourceMastery,
        now
      );
    }
  }

  // Retire the source row.
  await txn.runAsync('DELETE FROM progress WHERE node_id = ?', from);
}

/**
 * MERGE: multiple `from[]` nodes collapse into one `to` node.
 * Anti-shame: `to` gets MAX(to_existing, MAX(all sources' mastery)). Never reduce.
 * All source rows are deleted after the merge.
 */
async function applyMerge(
  txn: SQLiteDatabase,
  fromIds: NodeId[],
  to: NodeId
): Promise<void> {
  // Compute the maximum mastery across all source nodes.
  let maxSourceMastery: MasteryLevel = 0;
  for (const sourceId of fromIds) {
    const m = await getMasteryLevel(txn, sourceId);
    if (m > maxSourceMastery) {
      maxSourceMastery = m;
    }
  }

  const now = Date.now();

  // Apply to `to` node: MAX(existing, maxSource).
  const toExists = await txn.getFirstAsync<{ node_id: string }>(
    'SELECT node_id FROM progress WHERE node_id = ?',
    to
  );

  if (toExists) {
    await txn.runAsync(
      `UPDATE progress
       SET mastery_level = MAX(mastery_level, ?),
           updated_at    = ?
       WHERE node_id = ?`,
      maxSourceMastery,
      now,
      to
    );
  } else {
    await txn.runAsync(
      `INSERT INTO progress (node_id, mastery_level, streak, xp, due_at, metrics, updated_at)
       VALUES (?, ?, 0, 0, NULL, '{}', ?)`,
      to,
      maxSourceMastery,
      now
    );
  }

  // Retire all source rows.
  for (const sourceId of fromIds) {
    await txn.runAsync('DELETE FROM progress WHERE node_id = ?', sourceId);
  }
}

/**
 * DEPRECATE: retire the source row without touching any other node.
 * Anti-shame: no survivor's mastery is ever touched. The source simply disappears.
 */
async function applyDeprecate(
  txn: SQLiteDatabase,
  from: NodeId
): Promise<void> {
  await txn.runAsync('DELETE FROM progress WHERE node_id = ?', from);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a declarative list of graph node-identity migration operations.
 *
 * Semantics:
 *   - Empty list → immediate no-op (no DB access, no transactions opened).
 *   - Each op runs in its own exclusive transaction for atomicity.
 *   - Ops are applied in array order (callers must supply a topologically safe order).
 *   - Anti-shame: mastery_level is NEVER lowered by any op (enforced by MAX guards).
 *
 * Axis separation:
 *   - This function NEVER reads or writes PRAGMA user_version.
 *   - It operates purely on the `progress` table keyed by node_id.
 *   - graphVersion tracking is stage 02's responsibility; this function is the
 *     mechanism that stage 02 drives.
 *
 * Stage 01 ships this as the mechanism + no-op default (empty ops list).
 * Stage 02 supplies real ops when it first bumps graphVersion.
 *
 * @param ops Array of GraphMigrationOp values to apply, in order.
 */
export async function applyGraphMigrations(ops: GraphMigrationOp[]): Promise<void> {
  // Fast path: empty ops is a documented no-op.
  if (ops.length === 0) {
    return;
  }

  const db = getDb();

  for (const op of ops) {
    await runExclusive(db, async (txn) => {
      switch (op.op) {
        case 'rename':
          await applyRename(txn, op.from, op.to);
          break;
        case 'split':
          await applySplit(txn, op.from, op.to);
          break;
        case 'merge':
          await applyMerge(txn, op.from, op.to);
          break;
        case 'deprecate':
          await applyDeprecate(txn, op.from);
          break;
        default: {
          // TypeScript exhaustiveness guard — unreachable at runtime if types are correct.
          const _never: never = op;
          throw new Error(`Unknown graph migration op: ${JSON.stringify(_never)}`);
        }
      }
    });
  }
}
