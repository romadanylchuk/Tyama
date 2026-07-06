/**
 * scheduler-metrics.ts — `metrics.spacedRepetition` sub-shape types and pure helpers.
 *
 * The stage-01 `progress.metrics` column is an opaque JSON string the DB never
 * queries. This module owns the `spacedRepetition` sub-key within that blob:
 * the typed shape of the banded interval index and lapse count, plus pure
 * (side-effect-free) parse / seed / serialize helpers.
 *
 * MIRRORS `mastery-metrics.ts` EXACTLY (including the other-key carry-through):
 *   - `seedSpacedRepetition()` — factory for a first-touch state (band 0, 0 lapses).
 *   - `parseSpacedRepetition(metricsJson)` — safe, non-throwing parser.
 *   - `serializeSpacedRepetition(other, slice)` — merges back into the full blob.
 *
 * KEY INVARIANTS:
 *   - `metrics.spacedRepetition` and `metrics.mastery` COEXIST in the same JSON blob.
 *     Every serialize call MUST pass the `other` bag from `parseSpacedRepetition` so
 *     that `metrics.mastery` (and any other key) survives every round-trip untouched.
 *   - No DB schema migration: this is a sub-key of the existing opaque `metrics` blob.
 *     `DB_SCHEMA_VERSION` is UNTOUCHED.
 *   - `lapses` is telemetry-only; it is serialized alongside `intervalBandIndex` but
 *     is NEVER read by band math, disposition, or routing logic.
 *
 * ANTI-SHAME INVARIANT:
 *   Nothing in this module subtracts, demotes, or penalises any value. Safe
 *   degradation seeds a neutral baseline (band 0, 0 lapses) — the least-intrusive
 *   default, not a punitive reset.
 *
 * STORAGE BOUNDARY:
 *   These helpers do NOT read or write the database. Callers are responsible for
 *   calling `getProgress(nodeId)` to obtain the raw string and
 *   `upsertNonMilestoneProgress(...)` to persist the serialized result.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 */

import type { NodeId, ProgressRow } from '@/db/types';

// ---------------------------------------------------------------------------
// SpacedRepetitionSlice — the `metrics.spacedRepetition` sub-object
// ---------------------------------------------------------------------------

/**
 * The `spacedRepetition` sub-key of the `progress.metrics` JSON blob.
 *
 * Stored as `JSON.parse(row.metrics).spacedRepetition`.
 * The rest of the metrics object is preserved opaquely via the `other` carry-through.
 */
export interface SpacedRepetitionSlice {
  /**
   * Current band index (0-indexed into `SpacedRepetitionConfig.intervalsMs`).
   * Clamped at both ends by `scheduleReview` — always ∈ [0, top].
   */
  readonly intervalBandIndex: number;
  /**
   * Cumulative lapse count (telemetry-only).
   * Incremented on each demote. NEVER read by band math or disposition logic.
   * Present so analysts can observe lapse frequency per node.
   */
  readonly lapses: number;
}

// ---------------------------------------------------------------------------
// ReviewItem — pure projection over a getDueNodes row (optional mapper)
// ---------------------------------------------------------------------------

/**
 * A richer, typed view of a due-review queue row.
 *
 * This is a PURE projection over `ProgressRow` rows returned by `getDueNodes()`.
 * It adds the `intervalBandIndex` by parsing the metrics blob — no DB query.
 *
 * Used by the session layer when it needs to know which band a due node is in
 * (e.g. to pass the right config to `scheduleReview`).
 */
export interface ReviewItem {
  /** Stable node identifier. */
  readonly nodeId: NodeId;
  /** Epoch ms when this node is due (from the `due_at` DB column). */
  readonly dueAt: number;
  /** Current band index (parsed from `metrics.spacedRepetition`). */
  readonly intervalBandIndex: number;
}

// ---------------------------------------------------------------------------
// seedSpacedRepetition — first-touch factory
// ---------------------------------------------------------------------------

/**
 * Returns a fresh `SpacedRepetitionSlice` for a node that has never been
 * scheduled (first-touch baseline).
 *
 * Seeds at band 0 (shortest interval) with 0 lapses — the least-intrusive
 * default and the correct starting point for a newly-mastered skill.
 */
export function seedSpacedRepetition(): SpacedRepetitionSlice {
  return { intervalBandIndex: 0, lapses: 0 };
}

// ---------------------------------------------------------------------------
// parseSpacedRepetition — typed accessor over the opaque metrics blob
// ---------------------------------------------------------------------------

/**
 * parseSpacedRepetition(metricsJson: string): { spacedRepetition, other }
 *
 * Parses the opaque `progress.metrics` JSON string, extracts and validates
 * the `spacedRepetition` sub-key (seeding a neutral shape when absent or
 * malformed), and returns the typed slice alongside the preserved `other` keys.
 *
 * OTHER-KEY CARRY-THROUGH:
 *   The `other` bag contains ALL keys from the metrics blob EXCEPT `spacedRepetition`.
 *   Critically, this includes `mastery` (stage-04's sub-key). Callers MUST pass
 *   `other` to `serializeSpacedRepetition(other, slice)` so that `mastery` (and
 *   any other key) survives every round-trip untouched.
 *
 * FIRST-TOUCH HANDLING:
 *   - Empty string → seeds `{ spacedRepetition: seedSpacedRepetition(), other: {} }`.
 *   - Valid JSON but no `spacedRepetition` key → seeds slice; other keys preserved.
 *   - Malformed JSON → seeds everything (safe degradation, never throws).
 *
 * ANTI-SHAME: no error thrown on parse failure — always returns a usable baseline.
 *
 * @param metricsJson - The raw `progress.metrics` column value.
 * @returns           - Typed `spacedRepetition` slice + opaque `other` carry-through.
 */
export function parseSpacedRepetition(metricsJson: string): {
  readonly spacedRepetition: SpacedRepetitionSlice;
  readonly other: Record<string, unknown>;
} {
  if (metricsJson === '') {
    return { spacedRepetition: seedSpacedRepetition(), other: {} };
  }

  let parsed: Record<string, unknown>;
  try {
    const raw = JSON.parse(metricsJson);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { spacedRepetition: seedSpacedRepetition(), other: {} };
    }
    parsed = raw as Record<string, unknown>;
  } catch {
    // Malformed JSON — safe degradation: seed empty, preserve nothing.
    return { spacedRepetition: seedSpacedRepetition(), other: {} };
  }

  // Extract `spacedRepetition` sub-key; preserve all other keys in `other`.
  const { spacedRepetition: srRaw, ...other } = parsed;

  const spacedRepetition = extractSpacedRepetitionSlice(srRaw);
  return { spacedRepetition, other };
}

// ---------------------------------------------------------------------------
// serializeSpacedRepetition — reconstruct the full opaque blob
// ---------------------------------------------------------------------------

/**
 * serializeSpacedRepetition(other, slice): string
 *
 * Merges the updated `spacedRepetition` slice back with the preserved `other` keys
 * and returns a JSON string suitable for storing in `progress.metrics`.
 *
 * The `other` object MUST be the one returned by `parseSpacedRepetition` — it
 * holds all non-spacedRepetition keys verbatim (including `mastery`). Passing
 * the wrong `other` bag can silently discard `metrics.mastery`.
 *
 * @param other - Preserved non-spacedRepetition keys from `parseSpacedRepetition`.
 * @param slice - Updated `SpacedRepetitionSlice` from `scheduleReview`.
 * @returns     - JSON string to write back to `progress.metrics`.
 */
export function serializeSpacedRepetition(
  other: Record<string, unknown>,
  slice: SpacedRepetitionSlice
): string {
  return JSON.stringify({ ...other, spacedRepetition: slice });
}

// ---------------------------------------------------------------------------
// toReviewItem — pure projection over a getDueNodes row
// ---------------------------------------------------------------------------

/**
 * toReviewItem(row: ProgressRow): ReviewItem
 *
 * Pure projection from a `ProgressRow` (returned by `getDueNodes()`) into a
 * `ReviewItem` with the current `intervalBandIndex` decoded from the metrics blob.
 *
 * NO DB QUERY — this is a synchronous, pure transformation over an already-loaded
 * row. The caller is responsible for obtaining the row via `getDueNodes()`.
 *
 * `row.dueAt` is asserted non-null here because `getDueNodes` only returns rows
 * where `due_at IS NOT NULL`. If `dueAt` is null (defensive fallback), uses 0.
 *
 * @param row - A `ProgressRow` from `getDueNodes()`.
 * @returns   - A `ReviewItem` with the band index decoded from `metrics`.
 */
export function toReviewItem(row: ProgressRow): ReviewItem {
  const { spacedRepetition } = parseSpacedRepetition(row.metrics);
  return {
    nodeId: row.nodeId,
    dueAt: row.dueAt ?? 0,
    intervalBandIndex: spacedRepetition.intervalBandIndex,
  };
}

// ---------------------------------------------------------------------------
// Internal helper — coerce unknown JSON to SpacedRepetitionSlice
// ---------------------------------------------------------------------------

/**
 * Attempts to coerce an arbitrary parsed-JSON value into a `SpacedRepetitionSlice`.
 * Seeds a neutral baseline for any invalid/unexpected structure.
 */
function extractSpacedRepetitionSlice(raw: unknown): SpacedRepetitionSlice {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return seedSpacedRepetition();
  }

  const obj = raw as Record<string, unknown>;

  // Coerce intervalBandIndex — must be a finite number, default 0.
  const bandRaw = obj.intervalBandIndex;
  const intervalBandIndex =
    typeof bandRaw === 'number' && isFinite(bandRaw) ? Math.max(0, Math.floor(bandRaw)) : 0;

  // Coerce lapses — must be a finite number, default 0.
  const lapsesRaw = obj.lapses;
  const lapses =
    typeof lapsesRaw === 'number' && isFinite(lapsesRaw) ? Math.max(0, Math.floor(lapsesRaw)) : 0;

  return { intervalBandIndex, lapses };
}
