/**
 * Shared TypeScript types and constants for the Tyama database layer.
 *
 * VERSION AXES:
 * - DB_SCHEMA_VERSION (this file): tracks the SQLite table shape, advanced by the
 *   migration runner via PRAGMA user_version. This is the DB-schema axis.
 * - graphVersion (stage 02, in-asset): tracks skill-graph content (nodes/edges),
 *   advanced by graph_migrations ops keyed on a semver string. Entirely separate clock.
 *
 * These two axes MUST NEVER be conflated. graph_migrations ops never touch
 * PRAGMA user_version; schema migrations never touch graphVersion.
 */

// ---------------------------------------------------------------------------
// Branded scalar types
// ---------------------------------------------------------------------------

/** Stable string identifier for a skill-graph node. Primary key of progress rows. */
export type NodeId = string;

/**
 * INTEGER ordinal representing mastery level.
 * Anti-shame invariant: this value only increases or holds — it NEVER decreases.
 * Graph migration propagation (split/merge/rename) uses max() to enforce this.
 */
export type MasteryLevel = number;

/** ISO-8601 date-time string (stored as TEXT where needed). */
export type Iso8601 = string;

// ---------------------------------------------------------------------------
// DB schema version constant — DB-schema axis only
// ---------------------------------------------------------------------------

/**
 * Target value for PRAGMA user_version after all migrations have run.
 * Increment this when a new DDL migration step is added.
 * Do NOT conflate with graphVersion (skill-graph content version, stage 02).
 */
export const DB_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Progress (materialized read-authority)
// ---------------------------------------------------------------------------

/**
 * One row per skill-graph node. This is the read-authority for all progress
 * decisions (routing, mastery gating, spaced-repetition scheduling).
 *
 * Milestone-state fields (mastery_level) are mutated ONLY via the milestone gate.
 * Non-milestone fields (streak, xp, due_at, metrics) may be mutated via
 * upsertNonMilestoneProgress.
 */
export interface ProgressRow {
  /** Stable node identifier — primary key. */
  nodeId: NodeId;
  /** INTEGER ordinal; only ever increases (anti-shame). */
  masteryLevel: MasteryLevel;
  /** Current consecutive-correct-session streak count. */
  streak: number;
  /** Accumulated experience points. */
  xp: number;
  /**
   * Spaced-repetition due timestamp (epoch ms).
   * NULL means not yet scheduled. Partial-indexed for efficient due-queue reads.
   * Scheduling logic is stage 05; this is the stored shape only.
   */
  dueAt: number | null;
  /**
   * Opaque JSON blob for evolving per-node metrics the DB never needs to query.
   * Keeps schema migrations rare. Deserialize only at the application layer.
   */
  metrics: string;
  /** Wall-clock epoch ms of last update. */
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Durable (milestone) events — immutable history, compaction-immune
// ---------------------------------------------------------------------------

/**
 * Closed discriminated union of milestone event kinds.
 * Add kinds here as new milestones are designed; keep it closed so the
 * type system flags unhandled cases at call sites.
 */
export type MilestoneKind =
  | 'first_node_mastered'
  | 'first_domain_completed'
  | 'first_streak_reached';

/**
 * Input payload to recordMilestone(). The gate serializes this to JSON for
 * the durable_events table and uses it to update materialized milestone state.
 */
export interface MilestonePayload {
  kind: MilestoneKind;
  nodeId?: NodeId;
  /** Arbitrary structured detail; serialized to the JSON payload column. */
  detail?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sync-readiness envelope (on every event row)
// ---------------------------------------------------------------------------

/**
 * Fields carried on EVERY event row (both durable and firehose).
 * Present now at low cost; required to make sync a new consumer, not a rewrite.
 */
export interface EventEnvelope {
  /** Autoincrement local row id. */
  id: number;
  /** Stable per-install device identifier (settings-backed). */
  deviceId: string;
  /**
   * Monotonic logical counter. Provides event ordering within a device.
   * Persisted high-water mark is stored in the settings table (logicalSeq key).
   */
  seq: number;
  /** Wall-clock epoch ms at time of write. */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Durable event row (immutable history)
// ---------------------------------------------------------------------------

/**
 * A durable / milestone event. Written atomically with its materialized state
 * update inside one exclusive transaction via the milestone gate.
 * Compaction NEVER touches this table.
 */
export interface DurableEvent extends EventEnvelope {
  /** Discriminated kind, matching MilestoneKind. */
  kind: MilestoneKind;
  /** JSON-serialized MilestonePayload.detail (or '{}' if absent). */
  payload: string;
}

// ---------------------------------------------------------------------------
// Firehose event row (high-volume, compaction-eligible)
// ---------------------------------------------------------------------------

/**
 * A high-volume behavioral event (attempts, answers, navigation, etc.).
 * Written on a SEPARATE relaxed transaction — NOT inside the milestone gate tx.
 * Eligible for compaction by applyCompaction() when policy is armed.
 */
export interface FirehoseEvent extends EventEnvelope {
  /** Semantic event type string, e.g. 'attempt', 'answer', 'session_start'. */
  type: string;
  /** JSON-serialized payload; opaque blob from the DB perspective. */
  payload: string;
}
