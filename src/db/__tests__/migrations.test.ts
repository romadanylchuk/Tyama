/**
 * Migration test suite — Phase 2.
 *
 * Tests the forward-only numbered migration runner including:
 *   (a) Fresh DB migrates to DB_SCHEMA_VERSION and all tables/indices exist
 *   (b) Old-fixture test: DB at user_version=0 with no tables migrates forward
 *       and gets the correct user_version stamp
 *   (c) Idempotency: running the runner twice is a no-op (no error, same version)
 *   (d) Partial-index existence: idx_progress_due partial index is created
 *
 * Uses the expo-sqlite jest mock (wrapping sql.js in-memory SQLite) via the
 * test helper in jest.setup.ts.
 */

import { openDatabaseAsync } from 'expo-sqlite';
import { runMigrations } from '@/db/migrations';
import { DB_SCHEMA_VERSION } from '@/db/types';
import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/** Returns the list of table names present in the schema. */
async function getTableNames(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return rows.map((r) => r.name);
}

/** Returns the list of index names present in the schema. */
async function getIndexNames(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
  );
  return rows.map((r) => r.name);
}

/** Returns true if the named index exists. */
async function indexExists(db: SQLiteDatabase, indexName: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
    indexName
  );
  return row !== null;
}

/** Returns true if the named table exists. */
async function tableExists(db: SQLiteDatabase, tableName: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    tableName
  );
  return row !== null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Migration runner', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    // Each test gets a fresh in-memory database (user_version=0, no tables)
    db = await openDatabaseAsync(':memory:');
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  // -------------------------------------------------------------------------
  // (a) Fresh DB → user_version becomes DB_SCHEMA_VERSION and all tables exist
  // -------------------------------------------------------------------------
  it('migrates a fresh DB to DB_SCHEMA_VERSION', async () => {
    const versionBefore = await getUserVersion(db);
    expect(versionBefore).toBe(0);

    await runMigrations(db);

    const versionAfter = await getUserVersion(db);
    expect(versionAfter).toBe(DB_SCHEMA_VERSION);
    expect(versionAfter).toBe(1);
  });

  it('creates all expected tables', async () => {
    await runMigrations(db);

    const tables = await getTableNames(db);
    expect(tables).toContain('progress');
    expect(tables).toContain('durable_events');
    expect(tables).toContain('firehose_events');
    expect(tables).toContain('settings');
    expect(tables).toContain('graph_migrations');
  });

  it('creates all expected indices', async () => {
    await runMigrations(db);

    const indices = await getIndexNames(db);
    expect(indices).toContain('idx_progress_due');
    expect(indices).toContain('idx_firehose_created_at');
  });

  // -------------------------------------------------------------------------
  // (b) Old-fixture test: seed DB at user_version=0, no tables → run runner
  //     → migrates forward and stamps user_version correctly
  // -------------------------------------------------------------------------
  it('old-fixture: migrates a DB at user_version=0 with no tables forward', async () => {
    // Verify starting state is truly version 0, no tables
    const startingVersion = await getUserVersion(db);
    expect(startingVersion).toBe(0);
    const tablesBeforeMigration = await getTableNames(db);
    expect(tablesBeforeMigration).toHaveLength(0);

    // Run the migration runner
    await runMigrations(db);

    // After migration: correct version, tables and indices all present
    const versionAfter = await getUserVersion(db);
    expect(versionAfter).toBe(DB_SCHEMA_VERSION);

    expect(await tableExists(db, 'progress')).toBe(true);
    expect(await tableExists(db, 'durable_events')).toBe(true);
    expect(await tableExists(db, 'firehose_events')).toBe(true);
    expect(await tableExists(db, 'settings')).toBe(true);
    expect(await tableExists(db, 'graph_migrations')).toBe(true);
  });

  it('old-fixture: user_version is stamped inside the migration tx (atomicity)', async () => {
    // If the runner stamps user_version outside the tx, a mid-migration failure
    // could leave user_version advanced with no tables — that would be silent
    // corruption. We test the happy path here; the full rollback-resume path is
    // tested in "partial-failure: rollback leaves DB pristine and re-run succeeds".
    await runMigrations(db);

    // user_version must equal DB_SCHEMA_VERSION exactly — not 0, not > target
    expect(await getUserVersion(db)).toBe(DB_SCHEMA_VERSION);

    // All tables must exist — they were created in the same tx
    expect(await tableExists(db, 'progress')).toBe(true);
    expect(await tableExists(db, 'settings')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Partial-failure / rollback-resume: the highest-risk path.
  //
  // The runner stamps PRAGMA user_version = N as the LAST statement inside the
  // exclusive tx. If step.up() throws mid-way, withExclusiveTransactionAsync
  // issues ROLLBACK — all DDL reverts and user_version stays at 0. The next
  // runMigrations() call must therefore retry the step from scratch.
  //
  // This test exercises exactly that path:
  //   1. Override execAsync to throw after the first DDL call.
  //   2. Run runMigrations → it throws (propagated from the tx).
  //   3. Assert user_version === 0 (not advanced, no silent corruption).
  //   4. Assert no tables were created (DDL rolled back).
  //   5. Restore execAsync and run runMigrations again.
  //   6. Assert user_version === DB_SCHEMA_VERSION and all tables exist.
  // -------------------------------------------------------------------------
  it('partial-failure: rollback leaves DB pristine and re-run succeeds', async () => {
    // Step 1 — intercept execAsync on the db instance so the migration step
    // throws after the very first DDL execAsync call (simulating a failure
    // partway through step.up()).
    const originalExecAsync = db.execAsync.bind(db);
    let callCount = 0;
    const THROW_ON_CALL = 2; // let the first DDL succeed, throw on the second

    db.execAsync = async (source: string) => {
      callCount++;
      if (callCount >= THROW_ON_CALL) {
        throw new Error('Simulated mid-migration DDL failure');
      }
      return originalExecAsync(source);
    };

    // Step 2 — run the runner; it must throw because the step threw
    await expect(runMigrations(db)).rejects.toThrow('Simulated mid-migration DDL failure');

    // Step 3 — user_version must still be 0 (the tx rolled back before the
    // PRAGMA user_version = 1 statement was reached)
    expect(await getUserVersion(db)).toBe(0);

    // Step 4 — no tables should exist (DDL was fully rolled back)
    const tablesAfterFailure = await getTableNames(db);
    expect(tablesAfterFailure).toHaveLength(0);

    // Step 5 — restore execAsync and re-run migrations
    db.execAsync = originalExecAsync;
    await runMigrations(db);

    // Step 6 — the re-run must complete successfully
    expect(await getUserVersion(db)).toBe(DB_SCHEMA_VERSION);
    expect(await tableExists(db, 'progress')).toBe(true);
    expect(await tableExists(db, 'durable_events')).toBe(true);
    expect(await tableExists(db, 'firehose_events')).toBe(true);
    expect(await tableExists(db, 'settings')).toBe(true);
    expect(await tableExists(db, 'graph_migrations')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // (c) Idempotency: running the runner twice is a no-op
  // -------------------------------------------------------------------------
  it('is idempotent: running migrations twice leaves version unchanged', async () => {
    await runMigrations(db);
    const versionAfterFirst = await getUserVersion(db);

    // Second run — should be a no-op
    await runMigrations(db);
    const versionAfterSecond = await getUserVersion(db);

    expect(versionAfterSecond).toBe(versionAfterFirst);
    expect(versionAfterSecond).toBe(DB_SCHEMA_VERSION);
  });

  it('is idempotent: all tables still exist after second run', async () => {
    await runMigrations(db);
    await runMigrations(db);

    const tables = await getTableNames(db);
    expect(tables).toContain('progress');
    expect(tables).toContain('durable_events');
    expect(tables).toContain('firehose_events');
    expect(tables).toContain('settings');
    expect(tables).toContain('graph_migrations');
  });

  // -------------------------------------------------------------------------
  // (d) Partial-index existence
  // -------------------------------------------------------------------------
  it('creates the partial due_at index on the progress table', async () => {
    await runMigrations(db);

    expect(await indexExists(db, 'idx_progress_due')).toBe(true);
  });

  it('partial due_at index is usable for due-queue reads', async () => {
    await runMigrations(db);

    const now = Date.now();

    // Insert a scheduled row (due_at set) and an unscheduled row (due_at NULL)
    await db.runAsync(
      'INSERT INTO progress (node_id, mastery_level, streak, xp, due_at, metrics, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'node-a', 1, 2, 10, now - 1000, '{}', now
    );
    await db.runAsync(
      'INSERT INTO progress (node_id, mastery_level, streak, xp, due_at, metrics, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'node-b', 0, 0, 0, null, '{}', now
    );

    // Due-queue query: only rows where due_at IS NOT NULL AND due_at <= now
    const dueRows = await db.getAllAsync<{ node_id: string }>(
      'SELECT node_id FROM progress WHERE due_at IS NOT NULL AND due_at <= ? ORDER BY due_at',
      now
    );

    expect(dueRows).toHaveLength(1);
    expect(dueRows[0].node_id).toBe('node-a');
  });

  // -------------------------------------------------------------------------
  // Additional schema shape checks
  // -------------------------------------------------------------------------
  it('progress table has the correct column shape', async () => {
    await runMigrations(db);

    // Insert a minimal row to validate column names and defaults
    const testNow = Date.now();
    await db.runAsync(
      'INSERT INTO progress (node_id, updated_at) VALUES (?, ?)',
      'test-node', testNow
    );

    const row = await db.getFirstAsync<{
      node_id: string;
      mastery_level: number;
      streak: number;
      xp: number;
      due_at: number | null;
      metrics: string;
      updated_at: number;
    }>('SELECT * FROM progress WHERE node_id = ?', 'test-node');

    expect(row).not.toBeNull();
    expect(row!.node_id).toBe('test-node');
    expect(row!.mastery_level).toBe(0);   // DEFAULT 0
    expect(row!.streak).toBe(0);           // DEFAULT 0
    expect(row!.xp).toBe(0);              // DEFAULT 0
    expect(row!.due_at).toBeNull();        // nullable
    expect(row!.metrics).toBe('{}');       // DEFAULT '{}'
    expect(row!.updated_at).toBe(testNow);
  });

  it('durable_events table has autoincrement PK and sync-readiness columns', async () => {
    await runMigrations(db);

    const testNow = Date.now();
    await db.runAsync(
      'INSERT INTO durable_events (kind, payload, device_id, seq, created_at) VALUES (?, ?, ?, ?, ?)',
      'first_node_mastered', '{}', 'device-123', 1, testNow
    );

    const row = await db.getFirstAsync<{
      id: number;
      kind: string;
      payload: string;
      device_id: string;
      seq: number;
      created_at: number;
    }>('SELECT * FROM durable_events WHERE id = 1');

    expect(row).not.toBeNull();
    expect(row!.id).toBe(1);
    expect(row!.kind).toBe('first_node_mastered');
    expect(row!.device_id).toBe('device-123');
    expect(row!.seq).toBe(1);
    expect(row!.created_at).toBe(testNow);
  });

  it('graph_migrations table is empty by default (ships as no-op config-as-data)', async () => {
    await runMigrations(db);

    const rows = await db.getAllAsync('SELECT * FROM graph_migrations');
    expect(rows).toHaveLength(0);
  });

  it('settings table accepts key-value pairs', async () => {
    await runMigrations(db);

    await db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?)',
      'uiLanguage', '"uk"'
    );
    const row = await db.getFirstAsync<{ key: string; value: string }>(
      'SELECT * FROM settings WHERE key = ?',
      'uiLanguage'
    );
    expect(row).not.toBeNull();
    expect(row!.value).toBe('"uk"');
  });

  // -------------------------------------------------------------------------
  // Two version axes must never be conflated
  // -------------------------------------------------------------------------
  it('does not create any column or table named graphVersion', async () => {
    await runMigrations(db);

    // user_version (DB-schema axis) is in the SQLite file header, not a column
    // graphVersion (graph-content axis) lives in graph_migrations.graph_version
    // Verify: no SQLite object is named anything that conflates the two axes
    const allObjects = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master ORDER BY name"
    );
    const names = allObjects.map((r) => r.name.toLowerCase());
    // The graph_version field in graph_migrations is a column, not a separate object.
    // No top-level object should be named 'graphversion' or 'graph_version'.
    expect(names).not.toContain('graphversion');
    expect(names.filter(n => n === 'graph_version')).toHaveLength(0);
  });
});
