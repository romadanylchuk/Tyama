/**
 * DDL constants for all stage-01 tables and indices.
 *
 * These strings are consumed exclusively by migration steps (src/db/migrations/).
 * They are NOT used for hot reads or writes; those go through repository modules.
 *
 * VERSION AXIS NOTE: The table shapes here are the DB-schema axis, versioned by
 * PRAGMA user_version via the migration runner. They have no relation to
 * graphVersion (the in-asset skill-graph content version managed in stage 02).
 */

// ---------------------------------------------------------------------------
// progress table
// ---------------------------------------------------------------------------

/**
 * Materialized progress state — one row per skill-graph node.
 * This is the read-authority for routing, mastery gating, and scheduling.
 *
 * Columns:
 *  - node_id:       stable string node identifier, primary key
 *  - mastery_level: INTEGER ordinal (only increases; anti-shame invariant)
 *  - streak:        consecutive-correct-session counter
 *  - xp:            accumulated experience points
 *  - due_at:        spaced-repetition due timestamp (epoch ms, nullable)
 *                   NULL = not yet scheduled; see partial index below
 *  - metrics:       opaque JSON blob for evolving per-node metrics (never queried)
 *  - updated_at:    wall-clock epoch ms of last mutation
 */
export const CREATE_PROGRESS_TABLE = `
CREATE TABLE IF NOT EXISTS progress (
  node_id       TEXT    PRIMARY KEY,
  mastery_level INTEGER NOT NULL DEFAULT 0,
  streak        INTEGER NOT NULL DEFAULT 0,
  xp            INTEGER NOT NULL DEFAULT 0,
  due_at        INTEGER,
  metrics       TEXT    NOT NULL DEFAULT '{}',
  updated_at    INTEGER NOT NULL
)
`.trim();

/**
 * Partial index on due_at for efficient spaced-repetition due-queue reads.
 * Query pattern: SELECT ... WHERE due_at IS NOT NULL AND due_at <= :now ORDER BY due_at
 * The partial condition (WHERE due_at IS NOT NULL) keeps the index small and avoids
 * indexing the large set of unscheduled rows.
 */
export const CREATE_PROGRESS_DUE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_progress_due
  ON progress (due_at)
  WHERE due_at IS NOT NULL
`.trim();

// ---------------------------------------------------------------------------
// durable_events table (compaction-immune milestone history)
// ---------------------------------------------------------------------------

/**
 * Immutable durable / milestone event log.
 * Written atomically with materialized milestone-state updates via the gate.
 * NEVER touched by compaction — this table is the permanent historical record.
 *
 * Sync-readiness fields (device_id, seq, created_at) ride on every row at
 * negligible cost; they enable a future sync consumer without a schema change.
 */
export const CREATE_DURABLE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS durable_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL,
  payload    TEXT    NOT NULL,
  device_id  TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)
`.trim();

// ---------------------------------------------------------------------------
// firehose_events table (high-volume, compaction-eligible)
// ---------------------------------------------------------------------------

/**
 * High-volume behavioral event log (attempts, answers, navigation, etc.).
 * Written on a SEPARATE relaxed transaction, never inside the milestone gate tx.
 * Eligible for compaction when the retention policy is armed.
 *
 * created_at index supports age-based compaction scans.
 */
export const CREATE_FIREHOSE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS firehose_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL,
  payload    TEXT    NOT NULL,
  device_id  TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)
`.trim();

/**
 * Index on created_at for efficient age-based compaction reads.
 * Compaction scans: SELECT id WHERE created_at < :cutoff ORDER BY created_at.
 */
export const CREATE_FIREHOSE_CREATED_AT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_firehose_created_at
  ON firehose_events (created_at)
`.trim();

// ---------------------------------------------------------------------------
// settings table (hot-state seam)
// ---------------------------------------------------------------------------

/**
 * Key-value settings store.
 * All hot-state reads route through the SettingsRepository which maintains
 * an in-memory cache — raw SQL reads on this table are forbidden outside
 * settings-repository.ts (enforced by the no-raw-sql-hot-read ESLint rule).
 * Values are JSON-encoded strings to support typed SettingsSchema entries.
 */
export const CREATE_SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
`.trim();

// ---------------------------------------------------------------------------
// graph_migrations table (node-identity migration spine)
// ---------------------------------------------------------------------------

/**
 * Declarative graph-node identity migration mapping.
 * Ships empty (no rows) — a graphVersion bump in stage 02 populates this table
 * with ops (split, merge, rename, deprecate) that the applier runs forward.
 *
 * Primary key is (graph_version, op_index) so ops are applied in deterministic
 * per-version order and are idempotent across re-runs (applied_at tracks completion).
 *
 * VERSION AXIS NOTE: graph_version here is the skill-graph content version
 * (semver, managed by stage 02). It has NOTHING to do with PRAGMA user_version
 * (the DB-schema axis managed by the migration runner). They are separate clocks.
 */
export const CREATE_GRAPH_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS graph_migrations (
  graph_version TEXT    NOT NULL,
  op_index      INTEGER NOT NULL,
  op_json       TEXT    NOT NULL,
  applied_at    INTEGER,
  PRIMARY KEY (graph_version, op_index)
)
`.trim();
