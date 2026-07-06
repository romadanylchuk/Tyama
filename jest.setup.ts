/**
 * Jest test bootstrap (setupFilesAfterEnv — runs after the test framework is
 * installed so beforeEach/afterEach are available).
 *
 * Phase 1 note: this file was originally wired via `setupFiles`. It has been
 * moved to `setupFilesAfterEnv` in Phase 2 so that beforeEach/afterEach DB
 * hooks work correctly (setupFiles runs before Jest globals are available).
 *
 * Phase 2 additions:
 *   - openTestDb()  — open a fresh in-memory SQLiteDatabase for a test
 *   - closeTestDb() — close and dispose an in-memory database
 *   - Global beforeEach/afterEach registration for automatic DB isolation when
 *     a test suite calls useTestDb()
 *
 * Phase 5 (stage 07) addition:
 *   - useRestartableTestDb() — a cold-restart test harness. Unlike useTestDb()
 *     (':memory:', always wiped on close — cheap, hermetic per-test isolation),
 *     this opens a NAMED database whose data survives a close()+reopen() cycle
 *     (see __mocks__/expo-sqlite.js's savedImages), so durability tests can
 *     simulate "the process was killed and the app cold-started again" and
 *     assert what state survives. A real OS-level process kill is the device
 *     matrix's job (see feature-plan.md Phase 5, Decision Log 4) — this harness
 *     proves the same invariant at the unit layer.
 */

import { openDatabaseAsync, deleteDatabaseAsync } from 'expo-sqlite';
import { runMigrations } from '@/db/migrations';
import { _setDbForTesting } from '@/db/database';
import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Global timeout (unchanged from Phase 1)
// ---------------------------------------------------------------------------
jest.setTimeout(10_000);

// ---------------------------------------------------------------------------
// In-memory SQLite test helper
// ---------------------------------------------------------------------------

/**
 * Open a fresh in-memory SQLiteDatabase and run all pending migrations.
 * Returns the database handle — the caller is responsible for closing it.
 *
 * Usage in a test:
 *   const db = await openTestDb();
 *   // … test code …
 *   await closeTestDb(db);
 */
export async function openTestDb(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(':memory:');
  await runMigrations(db);
  return db;
}

/**
 * Close and dispose a test database opened via openTestDb().
 */
export async function closeTestDb(db: SQLiteDatabase): Promise<void> {
  await db.closeAsync();
}

// ---------------------------------------------------------------------------
// Automatic per-suite DB isolation helper
// ---------------------------------------------------------------------------

/**
 * Wire automatic DB setup/teardown for a test suite.
 *
 * Call this at the top of a describe block (or test file scope) to get a
 * fresh migrated in-memory database per test, automatically injected into
 * the global DB singleton via _setDbForTesting().
 *
 * Example:
 *   const { getDb } = useTestDb();
 *   it('reads progress', async () => {
 *     const db = getDb();
 *     await db.execAsync("INSERT INTO progress ...");
 *   });
 *
 * The beforeEach opens a fresh DB; afterEach closes it and resets the
 * singleton so no state leaks between tests.
 */
export function useTestDb(): { getDb: () => SQLiteDatabase } {
  let _testDb: SQLiteDatabase | null = null;

  beforeEach(async () => {
    _testDb = await openTestDb();
    _setDbForTesting(_testDb);
  });

  afterEach(async () => {
    _setDbForTesting(null);
    if (_testDb) {
      await closeTestDb(_testDb);
      _testDb = null;
    }
  });

  return {
    getDb: () => {
      if (!_testDb) throw new Error('Test DB not initialized — call useTestDb() in describe scope');
      return _testDb;
    },
  };
}

// ---------------------------------------------------------------------------
// Cold-restart test harness (Phase 5, stage 07)
// ---------------------------------------------------------------------------

/** Monotonic counter so each test gets a distinct named DB — no cross-test collisions. */
let _restartDbCounter = 0;

/**
 * Wire automatic setup/teardown for a cold-restart-capable test suite.
 *
 * Like useTestDb(), but opens a NAMED database (not ':memory:') so its
 * committed data survives a close()+reopen() cycle. Use `reopen()` inside a
 * test to simulate "the process was killed and the app cold-started again":
 * it closes the current handle (which — per __mocks__/expo-sqlite.js —
 * serializes the sql.js image by name before disposing the live handle),
 * reopens the SAME name (reconstituting from that image), re-runs the
 * (idempotent, IF-NOT-EXISTS-guarded) migration runner exactly as a real
 * cold start's initDatabase() would, and re-injects the new handle via
 * _setDbForTesting().
 *
 * IMPORTANT — settings cache: the `settings` repository singleton keeps an
 * in-memory cache populated by hydrate(). reopen() does NOT re-hydrate it —
 * this is the same JS process, so the cache would otherwise silently keep
 * pre-"restart" values even though the DB handle changed underneath it. A
 * test that depends on settings-backed reads (getDeviceId(), nextSeq()) being
 * correct AFTER a simulated restart must `await settings.hydrate()` again
 * post-reopen(), exactly as a real app would on cold start.
 *
 * Example:
 *   const { getDb, reopen } = useRestartableTestDb();
 *   it('milestone state survives a cold restart', async () => {
 *     await recordMilestone({ kind: 'first_node_mastered', nodeId: 'n1' });
 *     await reopen();
 *     const progress = await getProgress('n1');
 *     expect(progress!.masteryLevel).toBe(1);
 *   });
 *
 * Real OS-level process-kill (not just closing/reopening a handle within the
 * same test process) is the device matrix's job — see feature-plan.md Phase 5,
 * Decision Log 4. This harness proves the both-or-neither invariant at the
 * unit layer, which is the load-bearing assertion surface for stage 07.
 */
export function useRestartableTestDb(): {
  getDb: () => SQLiteDatabase;
  reopen: () => Promise<SQLiteDatabase>;
} {
  let _testDb: SQLiteDatabase | null = null;
  let _dbName: string | null = null;

  beforeEach(async () => {
    _dbName = `restart-test-db-${++_restartDbCounter}`;
    _testDb = await openDatabaseAsync(_dbName);
    await runMigrations(_testDb);
    _setDbForTesting(_testDb);
  });

  afterEach(async () => {
    _setDbForTesting(null);
    if (_testDb && _dbName) {
      await _testDb.closeAsync();
      // Full teardown (not just a restart): remove the saved image too, so
      // no state leaks into a later test that happens to reuse a counter value.
      await deleteDatabaseAsync(_dbName);
    }
    _testDb = null;
    _dbName = null;
  });

  return {
    getDb: () => {
      if (!_testDb) {
        throw new Error('Restartable test DB not initialized — call useRestartableTestDb() in describe scope');
      }
      return _testDb;
    },
    reopen: async () => {
      if (!_testDb || !_dbName) {
        throw new Error('Restartable test DB not initialized — call useRestartableTestDb() in describe scope');
      }
      await _testDb.closeAsync();
      const reopened = await openDatabaseAsync(_dbName);
      await runMigrations(reopened);
      _testDb = reopened;
      _setDbForTesting(_testDb);
      return _testDb;
    },
  };
}
