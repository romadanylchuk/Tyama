/**
 * spaced-repetition.ts — Config-as-data SpacedRepetitionConfig and shipped defaults.
 *
 * CONFIG-AS-DATA INVARIANT:
 *   The interval ladder lives here as a shipped default. The `pedagogy-pass`
 *   calibrates band values later as a pure data change — no code change required.
 *   NEVER hardcode interval values into call-site logic; always resolve through
 *   `resolveSpacedRepetitionConfig`.
 *
 * PER-NODE OVERRIDE:
 *   The optional `GraphNode.difficultyHooks.spacedRepetition` field may override
 *   the global default for a specific node. `resolveSpacedRepetitionConfig(node)`
 *   merges the per-node override over `SR_POLICY`. (The override is optional;
 *   the global default is the fallback — mirror `resolveMasteryConfig` exactly.)
 *
 * BAND-CLAMP INVARIANT:
 *   Both ends are clamped: promote past the top band stays at the top;
 *   one-band demote at band 0 stays at band 0 (never negative, never reset).
 *   `TOP_BAND_INDEX = SR_POLICY.intervalsMs.length - 1` is the single source of
 *   truth for the top-band ceiling — never hardcode the literal index.
 *
 * ANTI-SHAME INVARIANT:
 *   The scheduler is the only writer of `intervalBandIndex`. A demote shifts
 *   exactly ONE band, clamped at the floor. `lapses` is telemetry-only and
 *   NEVER feeds band-movement logic.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 */

// ---------------------------------------------------------------------------
// SpacedRepetitionConfig interface
// ---------------------------------------------------------------------------

/**
 * Configuration for the banded spaced-repetition scheduler.
 *
 * `intervalsMs` is the ordered band ladder: `intervalsMs[i]` is the interval
 * (in milliseconds) added to `nowMs` when the learner's band index is `i`.
 *
 * Band 0 is the shortest interval (first review soon); the top band is the
 * longest (well-retained skill reviewed infrequently).
 */
export interface SpacedRepetitionConfig {
  /**
   * Ordered interval ladder in milliseconds, one entry per band.
   * Band 0 = shortest; top band = `intervalsMs.length - 1` = longest.
   * Must be non-empty. `pedagogy-pass` calibrates values; never hardcode.
   */
  readonly intervalsMs: readonly number[];
}

// ---------------------------------------------------------------------------
// DAY_MS — single-source materialization constant
// ---------------------------------------------------------------------------

/**
 * Milliseconds in one calendar day.
 * Used once here to materialize the band ladder from day values to ms.
 * Never import this outside this file — it is an internal materialization constant.
 */
const DAY_MS = 24 * 60 * 60 * 1_000; // 86_400_000 ms

// ---------------------------------------------------------------------------
// SR_POLICY — shipped global default (config-as-data, frozen)
// ---------------------------------------------------------------------------

/**
 * Shipped default spaced-repetition policy.
 *
 * Band ladder: [1, 3, 7, 16, 35, 70] DAYS → converted to milliseconds once.
 *
 * These are the working defaults the binary ships with. The `pedagogy-pass`
 * calibrates them later as a pure data change — no code change required.
 *
 * Day values → ms (DAY_MS = 86_400_000):
 *   Band 0:  1 day   →    86_400_000 ms
 *   Band 1:  3 days  →   259_200_000 ms
 *   Band 2:  7 days  →   604_800_000 ms
 *   Band 3: 16 days  → 1_382_400_000 ms
 *   Band 4: 35 days  → 3_024_000_000 ms
 *   Band 5: 70 days  → 6_048_000_000 ms
 */
export const SR_POLICY: SpacedRepetitionConfig = Object.freeze({
  intervalsMs: Object.freeze([1, 3, 7, 16, 35, 70].map((days) => days * DAY_MS)),
} satisfies SpacedRepetitionConfig);

// ---------------------------------------------------------------------------
// resolveSpacedRepetitionConfig — per-node-override-over-default resolver
// ---------------------------------------------------------------------------

/**
 * resolveSpacedRepetitionConfig(override?: Partial<SpacedRepetitionConfig>): SpacedRepetitionConfig
 *
 * Returns the effective spaced-repetition config by merging an optional
 * per-node override (from `GraphNode.difficultyHooks.spacedRepetition`) over
 * the global `SR_POLICY` default.
 *
 * The optional `override` parameter is the value from `DifficultyHooks.spacedRepetition`
 * (if present on the node). When absent, `SR_POLICY` is returned directly.
 *
 * MIRRORS `resolveMasteryConfig` in shape:
 *   - Global default when no override.
 *   - Field-by-field merge when an override is present.
 *   - Returned object is frozen (config-as-data, immutable at runtime).
 *
 * @param override - Optional per-node override (subset of SpacedRepetitionConfig).
 * @returns        - A frozen `SpacedRepetitionConfig` for this node.
 */
export function resolveSpacedRepetitionConfig(
  override?: Partial<SpacedRepetitionConfig>
): SpacedRepetitionConfig {
  if (override === undefined) {
    return SR_POLICY;
  }

  // Merge per-field: an absent field in the override falls back to SR_POLICY.
  return Object.freeze({
    intervalsMs: override.intervalsMs ?? SR_POLICY.intervalsMs,
  } satisfies SpacedRepetitionConfig);
}
