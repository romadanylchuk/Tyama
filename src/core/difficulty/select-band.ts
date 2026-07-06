/**
 * select-band.ts — Pure `selectBand` function for mastery-coordinate → Band mapping.
 *
 * The generator does NOT own the difficulty curve — `selectBand` lives in the
 * engine layer (DL-5) and is called by the generator after `loadGraph()` + the
 * scheduler supply a mastery coordinate.
 *
 * HALF-OPEN INTERVAL LADDER:
 *   Band i covers [bands[i].minCoordinate, bands[i+1].minCoordinate).
 *   The last band is open-ended on the right (extends to +∞).
 *   "Exact minCoordinate hit" → that band (upper boundary, not lower).
 *
 * ASSUMPTIONS:
 *   - `bands` is non-empty (programmer error if violated → throws `SelectBandError`).
 *   - `bands` is pre-sorted ascending by `minCoordinate` (invariant asserted by
 *     `validateGraph` at startup; re-sorting inside `selectBand` is rejected per
 *     DL-5 as it hides data errors and adds cost to a hot path).
 *
 * CLAMPING:
 *   - `coordinate < bands[0].minCoordinate` → returns the lowest band.
 *   - `coordinate > 1.0` → returns the highest band.
 *   No exceptions are thrown for out-of-range coordinates (degrade gracefully).
 *
 * VALIDATION HELPER:
 *   `validateBands(bands)` is defined here (alongside `selectBand`) and is
 *   consumed by `validateGraph` (Phase 4). It performs the same assertions
 *   `validateGraph` needs: non-empty, bands[0].minCoordinate === 0,
 *   strictly ascending minCoordinate. Returns `string[]` of violations so
 *   the caller can aggregate multiple errors before throwing.
 */

import type { Band } from '@/core/types';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown only when `selectBand` receives an empty `bands` array.
 * This is a programmer error (the graph asset must be validated at startup via
 * `validateGraph`, which rejects empty band ladders). An empty bands array in
 * production means a validation bypass — treat it as a hard failure.
 */
export class SelectBandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectBandError';
  }
}

// ---------------------------------------------------------------------------
// selectBand
// ---------------------------------------------------------------------------

/**
 * selectBand(coordinate: number, bands: Band[]): Band
 *
 * Maps a mastery coordinate (0..1) to the matching difficulty Band using a
 * half-open interval ladder: picks the highest band whose `minCoordinate <=
 * coordinate`. The lowest band is the floor (returned for any coordinate
 * below its `minCoordinate`).
 *
 * @param coordinate - Mastery coordinate, nominally in [0, 1]. Clamped
 *                     defensively: below floor → lowest band; above 1 → top band.
 * @param bands      - Non-empty array of bands, ascending by `minCoordinate`.
 *                     Pre-sorted (not re-sorted here — DL-5).
 *
 * @throws {SelectBandError} If `bands` is empty (programmer error).
 */
export function selectBand(coordinate: number, bands: Band[]): Band {
  if (bands.length === 0) {
    throw new SelectBandError(
      'selectBand() received an empty bands array. ' +
        'This is a programmer error: validateGraph() must reject nodes with empty band ladders.'
    );
  }

  // Single-band case: always return that band regardless of coordinate.
  if (bands.length === 1) {
    return bands[0];
  }

  // Clamp coordinate to [0, 1] defensively.
  // Below-floor (even negative) coordinates map to the lowest band.
  // Above-ceiling coordinates map to the highest band.
  const clamped = Math.max(bands[0].minCoordinate, Math.min(1, coordinate));

  // Walk from the top. Return the first band (highest) whose minCoordinate
  // is <= the clamped coordinate. This is the half-open [lower, upper) ladder:
  // - Exact minCoordinate hit → this band (not the one below).
  // - Coordinate in [bands[i].minCoordinate, bands[i+1].minCoordinate) → bands[i].
  for (let i = bands.length - 1; i >= 0; i--) {
    if (bands[i].minCoordinate <= clamped) {
      return bands[i];
    }
  }

  // Unreachable if bands[0].minCoordinate === 0 and coordinate >= 0.
  // Defensive fallback: return the lowest band.
  return bands[0];
}

// ---------------------------------------------------------------------------
// validateBands — consumed by validateGraph (Phase 4)
// ---------------------------------------------------------------------------

/**
 * validateBands(bands: Band[]): string[]
 *
 * Validates the band ladder for a single graph node's `difficultyHooks.bands`.
 * Returns an array of violation messages (empty = valid).
 *
 * Rules checked:
 *   1. Non-empty (`bands.length > 0`).
 *   2. `bands[0].minCoordinate === 0` (floor must be exactly 0).
 *   3. Strictly ascending `minCoordinate` (each entry > the previous).
 *
 * Used by `validateGraph` at startup/CI to assert every node's band ladder
 * is well-formed before any `selectBand` call can occur at runtime.
 *
 * @param bands - The band ladder to validate (may be empty or unordered).
 * @returns     - Array of human-readable violation strings. Empty = valid.
 */
export function validateBands(bands: Band[]): string[] {
  const violations: string[] = [];

  if (bands.length === 0) {
    violations.push('Band ladder is empty (must have at least one band).');
    return violations; // No further checks possible on an empty array.
  }

  if (bands[0].minCoordinate !== 0) {
    violations.push(
      `bands[0].minCoordinate must be 0 (the floor), got ${bands[0].minCoordinate}.`
    );
  }

  for (let i = 1; i < bands.length; i++) {
    if (bands[i].minCoordinate <= bands[i - 1].minCoordinate) {
      violations.push(
        `bands[${i}].minCoordinate (${bands[i].minCoordinate}) must be strictly ` +
          `greater than bands[${i - 1}].minCoordinate (${bands[i - 1].minCoordinate}).`
      );
    }
  }

  return violations;
}
