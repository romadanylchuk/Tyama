/**
 * Jest manual mock for expo-sqlite.
 *
 * Wraps sql.js (in-memory SQLite via WebAssembly/asm.js) to provide the
 * expo-sqlite async API surface used by the migration runner, transaction
 * wrappers, and repository modules.
 *
 * Implements only the methods used in Phase 2 (and later phases):
 *   - openDatabaseAsync(name)              → SQLiteDatabase
 *   - db.execAsync(sql)
 *   - db.getFirstAsync(sql, ...params)
 *   - db.getAllAsync(sql, ...params)
 *   - db.runAsync(sql, ...params)
 *   - db.withExclusiveTransactionAsync(task)
 *   - db.withTransactionAsync(task)
 *   - db.closeAsync()
 *
 * PRAGMA user_version is supported natively by sql.js — no special handling needed.
 *
 * Named databases are isolated: each call to openDatabaseAsync with a new name
 * creates a fresh in-memory DB. The ':memory:' name always creates a new one.
 *
 * COLD-RESTART SUPPORT (Phase 5, stage 07):
 * A NAMED (non-':memory:') database's data survives closeAsync(): on close, the
 * sql.js image is serialized (db.export()) and retained in `savedImages` keyed
 * by name; the next openDatabaseAsync(sameName) call reconstitutes the database
 * from that image instead of creating an empty one. This mirrors real file-backed
 * SQLite semantics (a closed file still holds its committed data) and lets the
 * jest.setup.ts restart harness (useRestartableTestDb) simulate "the process was
 * killed and the app cold-started again" without a real OS-level process kill.
 * ':memory:' databases are deliberately excluded from this — they always start
 * fresh, which is what every non-restart test (useTestDb()) relies on for cheap
 * per-test isolation.
 * deleteDatabaseAsync() and _clearAllDatabases() dispose of a saved image too
 * (full teardown — simulates an uninstall / SQLite wipe, not a restart).
 */

'use strict';

// sql.js wasm variant — uses the asm.js fallback file which doesn't need WASM
// infrastructure. The asm.js build works in any Node.js environment.
const initSqlJs = require('sql.js/dist/sql-asm.js');

// Cache of open databases by name (so multiple openDatabaseAsync('same') calls
// return the same instance, matching expo-sqlite behaviour for the app singleton).
const dbInstances = new Map();

// Serialized (Uint8Array) images of NAMED databases, retained across closeAsync()
// so a subsequent openDatabaseAsync(sameName) can reconstitute committed data —
// the cold-restart simulation used by jest.setup.ts's useRestartableTestDb().
// ':memory:' is never stored here (see module doc comment above).
const savedImages = new Map();

// Single shared sql.js SQL object (created lazily on first use)
let SQL = null;

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * Minimal parameter binding: converts expo-sqlite-style params to sql.js binding.
 * Supports array params and variadic args; named params (':foo', '$foo', '@foo')
 * are passed through as-is since sql.js handles them natively.
 */
function bindParams(params) {
  if (!params || (Array.isArray(params) && params.length === 0)) return [];
  if (Array.isArray(params)) return params;
  // Object params — sql.js accepts { ':key': value } objects
  if (typeof params === 'object') return params;
  return [params];
}

/**
 * Execute a SELECT and return all rows as plain objects, using sql.js.
 */
function execSelect(db, source, params) {
  const bound = bindParams(params);
  const stmt = db.prepare(source);
  try {
    stmt.bind(bound);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/**
 * Execute a non-SELECT statement (DDL, INSERT, UPDATE, DELETE) using sql.js.
 * Returns { lastInsertRowId, changes }.
 */
function execWrite(db, source, params) {
  const bound = bindParams(params);
  if (bound && (Array.isArray(bound) ? bound.length > 0 : Object.keys(bound).length > 0)) {
    const stmt = db.prepare(source);
    try {
      stmt.run(bound);
    } finally {
      stmt.free();
    }
  } else {
    db.run(source);
  }
  return {
    lastInsertRowId: db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0,
    changes: db.exec('SELECT changes()')[0]?.values[0][0] ?? 0,
  };
}

class MockSQLiteDatabase {
  constructor(sqlJsDb, name) {
    this._db = sqlJsDb;
    this._name = name;
    this._inTransaction = false;
  }

  async execAsync(source) {
    // Handle multiple statements separated by semicolons (for DDL batches)
    // sql.js db.run() supports multiple statements
    this._db.run(source);
  }

  async getFirstAsync(source, ...args) {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const rows = execSelect(this._db, source, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async getAllAsync(source, ...args) {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return execSelect(this._db, source, params);
  }

  async runAsync(source, ...args) {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return execWrite(this._db, source, params);
  }

  async prepareAsync(source) {
    const stmt = this._db.prepare(source);
    // Return a minimal mock statement object
    return {
      executeAsync: async (...params) => {
        const bound = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        stmt.bind(bound);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        return {
          getAllAsync: async () => rows,
          getFirstAsync: async () => rows[0] ?? null,
          lastInsertRowId: 0,
          changes: 0,
          [Symbol.asyncIterator]: async function* () { for (const r of rows) yield r; },
        };
      },
      finalizeAsync: async () => { stmt.free(); },
    };
  }

  /**
   * Simulate withExclusiveTransactionAsync.
   * In sql.js there's no actual locking, but we:
   *   1. Begin an exclusive-intent transaction with BEGIN.
   *   2. Pass `this` as the txn object (sql.js doesn't need a separate object).
   *   3. COMMIT on success, ROLLBACK on failure.
   */
  async withExclusiveTransactionAsync(task) {
    this._db.run('BEGIN');
    this._inTransaction = true;
    try {
      await task(this);
      this._db.run('COMMIT');
    } catch (err) {
      this._db.run('ROLLBACK');
      throw err;
    } finally {
      this._inTransaction = false;
    }
  }

  /**
   * Simulate withTransactionAsync (relaxed).
   * Same mechanics, no txn argument passed to the task.
   */
  async withTransactionAsync(task) {
    this._db.run('BEGIN');
    this._inTransaction = true;
    try {
      await task();
      this._db.run('COMMIT');
    } catch (err) {
      this._db.run('ROLLBACK');
      throw err;
    } finally {
      this._inTransaction = false;
    }
  }

  async isInTransactionAsync() {
    return this._inTransaction;
  }

  async closeAsync() {
    // Cold-restart support: a NAMED database's committed data survives close —
    // serialize it into savedImages before disposing the live sql.js handle.
    // ':memory:' is excluded so per-test isolation (useTestDb()) stays cheap
    // and unaffected: closing an in-memory DB always discards it for good.
    if (this._name !== ':memory:') {
      savedImages.set(this._name, this._db.export());
    }
    this._db.close();
    dbInstances.delete(this._name);
  }

  get databasePath() {
    return this._name;
  }
}

/**
 * Open (or return cached) an in-memory SQLiteDatabase by name.
 * Passing ':memory:' always creates a fresh, unshared database.
 */
async function openDatabaseAsync(databaseName, _options, _directory) {
  const sql = await getSql();

  // ':memory:' is always fresh
  if (databaseName === ':memory:') {
    const sqlDb = new sql.Database();
    return new MockSQLiteDatabase(sqlDb, ':memory:');
  }

  if (dbInstances.has(databaseName)) {
    return dbInstances.get(databaseName);
  }

  // Reconstitute from a saved image (cold-restart simulation) if one exists,
  // otherwise start fresh — matching real SQLite: opening an existing file
  // reads its contents; opening a name for the first time creates an empty DB.
  const saved = savedImages.get(databaseName);
  const sqlDb = saved ? new sql.Database(saved) : new sql.Database();
  const instance = new MockSQLiteDatabase(sqlDb, databaseName);
  dbInstances.set(databaseName, instance);
  return instance;
}

/**
 * Dispose and remove a named database from the cache, INCLUDING its saved
 * image (if any). This is a full teardown — simulates an uninstall / SQLite
 * wipe, not a restart. Used by test teardown helpers.
 */
async function deleteDatabaseAsync(databaseName) {
  if (dbInstances.has(databaseName)) {
    const instance = dbInstances.get(databaseName);
    instance._db.close();
    dbInstances.delete(databaseName);
  }
  savedImages.delete(databaseName);
}

/**
 * Clear all cached database instances AND all saved images.
 * Called by the test helper in jest.setup.ts between tests.
 */
function _clearAllDatabases() {
  for (const instance of dbInstances.values()) {
    try { instance._db.close(); } catch {}
  }
  dbInstances.clear();
  savedImages.clear();
}

module.exports = {
  openDatabaseAsync,
  openDatabaseSync: () => { throw new Error('openDatabaseSync not supported in test mock'); },
  deleteDatabaseAsync,
  deleteDatabaseSync: () => {},
  deserializeDatabaseAsync: async () => { throw new Error('not implemented in mock'); },
  addDatabaseChangeListener: () => ({ remove: () => {} }),
  // Internal test utility — not part of expo-sqlite public API
  _clearAllDatabases,
};
