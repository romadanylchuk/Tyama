/**
 * placement-seed.ts — pure onboarding placement-seed computation (stage 07,
 * Phase 2).
 *
 * PURPOSE:
 *   The onboarding placement ladder (`placement-controller.ts`) seeds a
 *   single `abstract`-level mastery slice per correctly-answered probe. This
 *   module is the PURE arithmetic core of that seed: no DB, no clock, no
 *   randomness, no strings — a plain function of (nodeConfig, target,
 *   optional prior aggregate) → `MasteryMetrics`.
 *
 * MASTERY-GATE SAFETY (never claims mastery):
 *   `v = max(priorAggregate ?? 0, min(targetCoordinate, nodeConfig.abstractFade,
 *   nodeConfig.masteryThreshold - MASTERY_GATE_SAFETY_MARGIN))`. Clamping to
 *   `nodeConfig.abstractFade` (not the raw target) means the effective seed
 *   is strictly below `nodeConfig.masteryThreshold` by the mastery-config
 *   ordering invariant (`masteryThreshold > abstractFade > pictorialFade` —
 *   see `src/core/mastery/mastery-config.ts`) for any config that honors it,
 *   even under a per-node override that lowers `abstractFade`. The direct
 *   `nodeConfig.masteryThreshold - MASTERY_GATE_SAFETY_MARGIN` term is a
 *   LOCAL, redundant defensive clamp: the ordering invariant is only
 *   unit-asserted for `DEFAULT_MASTERY_CONFIG` (nothing today validates a
 *   per-node `difficultyHooks.mastery` override against it), so this function
 *   never relies on that invariant alone — it is structurally incapable of
 *   seeding at/above `masteryThreshold` even if a future node config violates
 *   the ordering. This clamp applies only to the placement contribution
 *   itself, never to `priorAggregate` (see ANTI-SHAME below).
 *
 * ANTI-SHAME (raise-or-hold only):
 *   The `Math.max(priorAggregate ?? 0, …)` guard means this function can only
 *   raise or hold a prior aggregate — never lower it. A learner who already
 *   has a higher real aggregate (from an earlier session, or a re-run of
 *   onboarding) is never dragged down by a placement probe.
 *
 * ONLY THE ABSTRACT SLICE:
 *   Placement probes are always presented at the `abstract` representation
 *   level (only abstract-level attempts can lift the mastery coordinate
 *   meaningfully — see `DEFAULT_MASTERY_CONFIG.levelCeilings`). This function
 *   therefore populates exactly one slice (`abstract`) and leaves `concrete`/
 *   `pictorial` untouched (absent), matching a real single-attempt window of
 *   size 1.
 */

import type { MasteryConfig } from '@/core/mastery/mastery-config';
import type { MasteryMetrics } from '@/core/mastery/mastery-metrics';

// ---------------------------------------------------------------------------
// MASTERY_GATE_SAFETY_MARGIN — local defensive clamp margin
// ---------------------------------------------------------------------------

/**
 * Tiny margin subtracted from `nodeConfig.masteryThreshold` when clamping the
 * placement seed, so the result is strictly (not merely `<=`) below the
 * threshold — see MASTERY-GATE SAFETY above. `1e-6` is small enough to never
 * meaningfully affect the shipped 0..1 scalar range, but large enough to
 * survive floating-point rounding (unlike, say, `Number.EPSILON`, which is
 * too small relative to values near 0.8 to reliably change them).
 */
const MASTERY_GATE_SAFETY_MARGIN = 1e-6;

// ---------------------------------------------------------------------------
// buildPlacementSeed — pure seed computation
// ---------------------------------------------------------------------------

/**
 * buildPlacementSeed(nodeConfig, targetCoordinate, priorAggregate?): MasteryMetrics
 *
 * Computes the seeded `MasteryMetrics` for a single correctly-answered
 * placement probe on one node.
 *
 * @param nodeConfig       - `resolveMasteryConfig(node)` for the probed node.
 * @param targetCoordinate - `PLACEMENT_CONFIG.seedCoordinate` (the shipped
 *                           target seed value, 0..1).
 * @param priorAggregate   - The node's existing `mastery.aggregate` (from
 *                           `parseMasteryMetrics`), if any. Absent/undefined
 *                           is treated as `0` (a first-touch node).
 * @returns                - A `MasteryMetrics` with a single populated
 *                           `abstract` slice; `aggregate` equals that slice's
 *                           `scalar`.
 */
export function buildPlacementSeed(
  nodeConfig: MasteryConfig,
  targetCoordinate: number,
  priorAggregate?: number
): MasteryMetrics {
  // Defensive local clamp: never rely solely on the global ordering
  // invariant (masteryThreshold > abstractFade) holding for this node — clamp
  // directly against this node's own masteryThreshold too, so a future
  // per-node difficultyHooks.mastery override that violates the ordering
  // invariant still cannot produce a placement contribution at or above it.
  const safeCeiling = Math.min(
    nodeConfig.abstractFade,
    nodeConfig.masteryThreshold - MASTERY_GATE_SAFETY_MARGIN
  );
  const clampedTarget = Math.min(targetCoordinate, safeCeiling);
  const v = Math.max(priorAggregate ?? 0, clampedTarget);

  return {
    slices: {
      abstract: { window: [v], scalar: v },
    },
    aggregate: v,
  };
}
