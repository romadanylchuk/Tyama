/**
 * mastery-metrics.ts — `metrics.mastery` sub-shape types and pure helpers.
 *
 * The stage-01 `progress.metrics` column is an opaque JSON string the DB never
 * queries. This module owns the `mastery` sub-key within that blob: the typed
 * shape of per-representation-level rolling windows and their scalar projections,
 * plus pure (side-effect-free) parse / seed / serialize helpers.
 *
 * STORAGE BOUNDARY:
 *   These helpers are the typed accessor over the opaque `progress.metrics` blob.
 *   They do NOT read or write the database — callers (e.g. `ingestAttempt`) are
 *   responsible for calling `getProgress` to obtain the raw string and
 *   `upsertNonMilestoneProgress` to persist the serialized result.
 *
 * KEY INVARIANTS:
 *   - Windows NEVER mix representation levels: concrete, pictorial, and abstract
 *     each have their own independent window.
 *   - `aggregate = max` across present slice scalars (a learner who reached
 *     abstract is never dragged down by early concrete practice).
 *   - Unrelated `metrics` keys (e.g. from other stages) are preserved on every
 *     serialize round-trip via the `other` carry-through.
 *   - First-touch: `parseMasteryMetrics` seeds an empty shape (`{ slices: {},
 *     aggregate: 0 }`) when the `mastery` key is absent or the JSON is malformed.
 *
 * ANTI-SHAME INVARIANT:
 *   Nothing in this module subtracts, demotes, blocks, or evicts any value as
 *   a punishment signal. Window eviction is strictly size-bounded (oldest entry
 *   dropped when `windowSize` is exceeded by the engine push) — a natural
 *   rolling behaviour, not a penalty.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 */

import type { RepresentationLevel } from '@/core/types';

// ---------------------------------------------------------------------------
// MasterySlice — per-representation-level scored window
// ---------------------------------------------------------------------------

/**
 * The scored window for a single `(node, representationLevel)` slice.
 *
 * `window` holds the raw per-attempt scalars, ordered oldest-first, newest-last.
 * The engine pushes new raws onto the tail and evicts from the head when the
 * window exceeds `windowSize`.
 *
 * `scalar` is the current combination of the window entries (e.g. windowed mean),
 * recomputed each time a new raw is pushed. It is the value downstream code
 * reads for this level — never recomputed from scratch at read time.
 */
export interface MasterySlice {
  /**
   * Raw per-attempt scalars for this level, oldest-first, newest-last.
   * Each raw ∈ [0, levelCeiling(level)] — 0 for a failed-step attempt;
   * at most `config.levelCeilings[level]` for a correct attempt (concrete ≤ 0.45,
   * pictorial ≤ 0.75, abstract ≤ 1.0 with shipped defaults).
   * Length ≤ `windowSize` (enforced by the engine; the DB stores the materialized list).
   */
  readonly window: readonly number[];
  /**
   * Windowed combination scalar (e.g. mean of `window`).
   * ∈ [0, config.levelCeilings[level]] — recomputed on each engine push.
   * Hard-capped at the level ceiling by the engine; `sliceScalar ≤ levelCeiling`
   * is a structural guarantee enforced both by `SPEED_FACTOR_MAX ≤ 1.0` and by
   * a defensive clamp in `rawAttemptScalar`.
   */
  readonly scalar: number;
}

// ---------------------------------------------------------------------------
// MasteryMetrics — the full `metrics.mastery` sub-object
// ---------------------------------------------------------------------------

/**
 * The `mastery` sub-key of the `progress.metrics` JSON blob.
 *
 * Stored as `JSON.parse(row.metrics).mastery`. The rest of the metrics object
 * is preserved opaquely by `parseMasteryMetrics` / `serializeMasteryMetrics`.
 *
 * `aggregate = max(present slice scalars)` — never mean, never min.
 * A learner who reached abstract is not dragged down by early concrete practice.
 * When no slices are present (first touch), `aggregate = 0`.
 */
export interface MasteryMetrics {
  /**
   * Per-representation-level scored windows.
   * Partial: only levels that have received at least one attempt are present.
   */
  readonly slices: Partial<Record<RepresentationLevel, MasterySlice>>;
  /**
   * Aggregate mastery coordinate (0..1) = max across present slice scalars.
   * 0 when no slices are present (first-touch / no attempts yet).
   * This is the value read by `selectBand`, scaffolding-fade cut-points, and
   * stage-06 gamification rings.
   */
  readonly aggregate: number;
}

// ---------------------------------------------------------------------------
// ParsedMetricsBlob — the full parsed metrics object
// ---------------------------------------------------------------------------

/**
 * Internal representation of the fully parsed `progress.metrics` JSON blob.
 *
 * `mastery` is the strongly-typed sub-shape owned by this module.
 * `other` holds all other keys present in the blob, preserved verbatim so
 * they survive every `serialize → deserialize` round-trip.
 *
 * MODULE-INTERNAL: this is the return shape of `parseMasteryMetrics` and is
 * NOT part of the public surface. Callers destructure `{ mastery, other }`
 * inline; they never name this type. Keep it un-exported.
 */
interface ParsedMetricsBlob {
  /**
   * The `mastery` sub-key (seeded empty when absent in the raw JSON).
   */
  readonly mastery: MasteryMetrics;
  /**
   * All other keys from the raw metrics JSON, preserved opaquely.
   * Passed back to `serializeMasteryMetrics` to reconstruct the full blob.
   */
  readonly other: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// seedMasteryMetrics — empty-metrics factory (first-touch)
// ---------------------------------------------------------------------------

/**
 * Returns a fresh empty `MasteryMetrics` representing a first-touch node
 * (no attempts yet on any level).
 *
 * `aggregate = 0`, `slices = {}`.
 */
export function seedMasteryMetrics(): MasteryMetrics {
  return { slices: {}, aggregate: 0 };
}

// ---------------------------------------------------------------------------
// parseMasteryMetrics — typed accessor over the opaque metrics blob
// ---------------------------------------------------------------------------

/**
 * parseMasteryMetrics(metricsJson: string): ParsedMetricsBlob
 *
 * Parses the opaque `progress.metrics` JSON string, extracts and validates
 * the `mastery` sub-key (seeding an empty shape when absent or malformed),
 * and returns the typed sub-object alongside the preserved `other` keys.
 *
 * FIRST-TOUCH HANDLING:
 *   - Empty string → seeds `{ mastery: seedMasteryMetrics(), other: {} }`.
 *   - Valid JSON but no `mastery` key → seeds empty mastery; other keys preserved.
 *   - Malformed JSON → logs a warning and seeds everything empty (safe degradation).
 *
 * ANTI-SHAME: no error is thrown on parse failure — the engine always has a
 * usable empty baseline to work from.
 *
 * @param metricsJson - The raw `progress.metrics` column value (JSON string).
 * @returns           - Typed mastery sub-object + opaque other-key carry-through.
 */
export function parseMasteryMetrics(metricsJson: string): ParsedMetricsBlob {
  if (metricsJson === '') {
    return { mastery: seedMasteryMetrics(), other: {} };
  }

  let parsed: Record<string, unknown>;
  try {
    const raw = JSON.parse(metricsJson);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { mastery: seedMasteryMetrics(), other: {} };
    }
    parsed = raw as Record<string, unknown>;
  } catch {
    // Malformed JSON — safe degradation: seed empty, preserve nothing (unknown content).
    return { mastery: seedMasteryMetrics(), other: {} };
  }

  // Extract `mastery` sub-key; preserve all other keys in `other`.
  const { mastery: masteryRaw, ...other } = parsed;

  const mastery = extractMasteryMetrics(masteryRaw);
  return { mastery, other };
}

// ---------------------------------------------------------------------------
// serializeMasteryMetrics — reconstruct the full opaque blob
// ---------------------------------------------------------------------------

/**
 * serializeMasteryMetrics(other: Record<string, unknown>, mastery: MasteryMetrics): string
 *
 * Merges the updated `mastery` sub-object back with the preserved `other` keys
 * and returns a JSON string suitable for storing in `progress.metrics`.
 *
 * The `other` object must be the one returned by `parseMasteryMetrics` — it
 * holds all non-mastery keys verbatim from the prior blob. This ensures that
 * keys owned by other stages (e.g. stage 05 scheduling hints) survive
 * every ingest round-trip.
 *
 * @param other   - Preserved non-mastery keys from `parseMasteryMetrics`.
 * @param mastery - Updated mastery sub-object from the engine.
 * @returns       - JSON string to write back to `progress.metrics`.
 */
export function serializeMasteryMetrics(
  other: Record<string, unknown>,
  mastery: MasteryMetrics
): string {
  return JSON.stringify({ ...other, mastery });
}

// ---------------------------------------------------------------------------
// Internal helper — coerce unknown JSON to MasteryMetrics
// ---------------------------------------------------------------------------

/**
 * Attempts to coerce an arbitrary parsed-JSON value into a `MasteryMetrics`.
 * Seeds an empty shape for any invalid/unexpected structure.
 */
function extractMasteryMetrics(raw: unknown): MasteryMetrics {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return seedMasteryMetrics();
  }

  const obj = raw as Record<string, unknown>;
  const slicesRaw = obj.slices;
  const aggregateRaw = obj.aggregate;

  const aggregate =
    typeof aggregateRaw === 'number' && isFinite(aggregateRaw) ? aggregateRaw : 0;

  const slices: Partial<Record<RepresentationLevel, MasterySlice>> = {};
  const levels: RepresentationLevel[] = ['concrete', 'pictorial', 'abstract'];

  if (typeof slicesRaw === 'object' && slicesRaw !== null && !Array.isArray(slicesRaw)) {
    const slicesObj = slicesRaw as Record<string, unknown>;
    for (const level of levels) {
      const sliceRaw = slicesObj[level];
      const slice = extractMasterySlice(sliceRaw);
      if (slice !== null) {
        slices[level] = slice;
      }
    }
  }

  return { slices, aggregate };
}

/**
 * Attempts to coerce an arbitrary parsed-JSON value into a `MasterySlice`.
 * Returns `null` if the slice is absent or invalid (slot is omitted).
 */
function extractMasterySlice(raw: unknown): MasterySlice | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const windowRaw = obj.window;
  const scalarRaw = obj.scalar;

  const scalar =
    typeof scalarRaw === 'number' && isFinite(scalarRaw) ? scalarRaw : 0;

  if (!Array.isArray(windowRaw)) {
    return { window: [], scalar };
  }

  const window: number[] = windowRaw
    .filter((v): v is number => typeof v === 'number' && isFinite(v));

  return { window, scalar };
}
