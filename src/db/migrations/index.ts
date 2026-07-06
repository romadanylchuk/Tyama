/**
 * Migration registry and forward-only runner.
 *
 * ============================================================================
 * VERSION AXES — NEVER CONFLATE
 * ============================================================================
 * This module manages the DB-SCHEMA version axis only:
 *   - Tracked by: PRAGMA user_version (integer, stored in the SQLite file header)
 *   - Advanced by: this runner, inside each migration step's exclusive tx
 *   - Represents: the shape of tables/indices (DDL)
 *
 * The GRAPH-CONTENT version axis is entirely separate:
 *   - Tracked by: graphVersion (semver string, stored in-asset / graph_migrations table)
 *   - Advanced by: stage 02's graph migration applier (graph-migration-repository.ts)
 *   - Represents: skill-graph nodes/edges/weights (config-as-data)
 *
 * graph_migrations ops NEVER touch PRAGMA user_version.
 * Schema migration steps NEVER touch graphVersion.
 * ============================================================================
 *
 * RUNNER INVARIANTS (from interview decision D4a):
 *   1. Forward-only: steps are sorted ascending by version and only pending
 *      steps (version > current user_version) are applied.
 *   2. One exclusive transaction per step: each migration step runs inside its
 *      own withExclusiveTransactionAsync call.
 *   3. user_version stamped inside the same tx: PRAGMA user_version = N is the
 *      LAST statement executed inside the step's exclusive transaction. This
 *      guarantees that if the step fails mid-way and rolls back, user_version
 *      does NOT advance — no silent schema corruption.
 *   4. Idempotent across re-runs: IF NOT EXISTS guards in DDL + the
 *      user_version check mean running twice is a no-op.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MigrationStep } from './001-initial';
import { migration001 } from './001-initial';
import { DB_SCHEMA_VERSION } from '../types';
import { runExclusive } from '../tx';

// ---------------------------------------------------------------------------
// Ordered migration registry
// Add new steps here in ascending version order ONLY.
// ---------------------------------------------------------------------------

const MIGRATIONS: MigrationStep[] = [
  migration001,
  // migration002, migration003, … added in future stages
];

// Validate registry order at module load time (catches accidental misordering)
for (let i = 1; i < MIGRATIONS.length; i++) {
  if (MIGRATIONS[i].version <= MIGRATIONS[i - 1].version) {
    throw new Error(
      `Migration registry is out of order: step at index ${i} has version ` +
        `${MIGRATIONS[i].version} which is not greater than previous version ` +
        `${MIGRATIONS[i - 1].version}. Fix the MIGRATIONS array in migrations/index.ts.`
    );
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Read the current PRAGMA user_version from the database.
 * Returns 0 for a brand-new (never-migrated) database.
 */
async function getCurrentVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Apply all pending migration steps in ascending version order.
 *
 * For each pending step:
 *   1. Opens a fresh withExclusiveTransactionAsync.
 *   2. Runs the step's `up(txn)` function — all DDL via `txn`, never `db`.
 *   3. Stamps `PRAGMA user_version = <version>` as the LAST statement in that tx.
 *   4. On commit, the version is durably advanced.
 *   5. On any error the tx rolls back; user_version stays at the prior value
 *      and the runner throws — next app start will retry from here.
 *
 * Must be called before any repository read. In practice: called from
 * initDatabase() which App.tsx awaits before rendering.
 *
 * NOTE: This runner only manages the DB-schema axis. It has no knowledge of
 * graphVersion (skill-graph content version, managed by stage 02).
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const currentVersion = await getCurrentVersion(db);

  if (currentVersion >= DB_SCHEMA_VERSION) {
    // Already at target version — nothing to do (idempotent).
    // Safe: initDatabase() holds _db as a singleton; concurrent calls are
    // impossible in the single-process model, so this TOCTOU window is benign.
    return;
  }

  const pendingSteps = MIGRATIONS.filter((step) => step.version > currentVersion);

  for (const step of pendingSteps) {
    await runExclusive(db, async (txn) => {
      // Run all DDL for this step via the transaction object.
      await step.up(txn);

      // Stamp user_version as the LAST statement inside this tx.
      // If anything above threw, we never reach this line and the tx rolls back.
      await txn.execAsync(`PRAGMA user_version = ${step.version}`);
    });
  }
}
