/**
 * Database singleton and startup orchestration.
 *
 * Exposes two public API points:
 *
 *   getDb()        — returns the lazily-opened SQLiteDatabase singleton.
 *                    Throws if called before initDatabase() completes.
 *
 *   initDatabase() — opens the DB (once), sets WAL journal mode, and runs all
 *                    pending schema migrations via runMigrations(). Must be
 *                    awaited by App.tsx before any repository read is issued.
 *
 * SINGLETON RATIONALE:
 * expo-sqlite's withExclusiveTransactionAsync requires all statements inside
 * a tx to go through the txn object, but the singleton handle is still used
 * to open the tx. A single instance avoids race conditions on the WAL journal
 * and keeps the connection count at 1 (SQLite's sweet spot for writes).
 *
 * VERSION AXIS NOTE:
 * initDatabase() manages only the DB-schema axis (PRAGMA user_version via
 * runMigrations). Graph content versioning (graphVersion) is a separate
 * concern handled by graph-migration-repository in stage 05/02.
 */

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './migrations';

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

/** The single open database handle. Set by initDatabase(); null before that. */
let _db: SQLiteDatabase | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the open SQLiteDatabase singleton.
 *
 * Precondition: initDatabase() must have resolved before calling this.
 * All repository modules call getDb() at the start of each operation.
 * Throws a descriptive error if called before initDatabase() completes.
 */
export function getDb(): SQLiteDatabase {
  if (!_db) {
    throw new Error(
      'Database not initialised. Await initDatabase() before calling getDb().'
    );
  }
  return _db;
}

/**
 * Initialise the database on app startup.
 *
 * Steps:
 *   1. Open (or reopen) `tyama.db` via openDatabaseAsync.
 *   2. Set WAL journal mode for better concurrent read performance.
 *   3. Run all pending schema migrations (runMigrations).
 *
 * Idempotent: calling twice is safe (the second call is a no-op once _db
 * is set and migrations have nothing pending). However, App.tsx should call
 * this exactly once on mount and await it before rendering content.
 *
 * Must complete before any repository read is issued (App.tsx awaits this).
 * Must complete before settings.hydrate() (Phase 3) can run.
 */
export async function initDatabase(): Promise<void> {
  if (!_db) {
    _db = await openDatabaseAsync('tyama.db');
    // WAL mode: readers don't block writers, writers don't block readers.
    // Set once at open time; persists in the DB file header.
    await _db.execAsync('PRAGMA journal_mode = WAL');
  }

  // Run any pending schema migrations. Safe to call even if already current.
  // DB-schema axis only — graphVersion is a separate concern.
  await runMigrations(_db);
}

/**
 * FOR TESTING ONLY — inject a pre-opened (in-memory) database handle.
 * Allows the jest.setup.ts helper to wire up a fresh DB per test without
 * touching the file system.
 *
 * Do NOT call this in production code paths.
 */
export function _setDbForTesting(db: SQLiteDatabase | null): void {
  _db = db;
}
