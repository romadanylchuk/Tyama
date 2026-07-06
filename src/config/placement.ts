/**
 * Onboarding shortened-placement config-as-data (stage 07).
 *
 * PURPOSE:
 *   The first-run onboarding flow's placement step is a short ascending
 *   ladder of abstract-level probes. This module ships the ladder's shape as
 *   config-as-data — probe count, the foundational node chain it walks, the
 *   skip-to-floor entry point, and the seed target — never hardcoded into
 *   call-site logic. The `pedagogy-pass` calibrates these values later as a
 *   pure data change; no code change required.
 *
 * CONFIG-AS-DATA INVARIANT (mirrors src/config/retention.ts):
 *   All placement tuning lives here. Consumers (the placement controller,
 *   stage 07 Phase 2) read `PLACEMENT_CONFIG`; they never inline a probe
 *   count, node id, or seed value of their own.
 *
 * ANTI-SHAME / MASTERY-GATE SAFETY:
 *   `seedCoordinate` is the *target* seed value for a correct abstract probe.
 *   The placement controller (Phase 2, via `buildPlacementSeed` in
 *   `src/ui/onboarding/placement-seed.ts`) clamps the actual write to
 *   `min(seedCoordinate, resolveMasteryConfig(node).abstractFade,
 *   resolveMasteryConfig(node).masteryThreshold - MASTERY_GATE_SAFETY_MARGIN)`
 *   per node, so the effective seed is strictly below `masteryThreshold`
 *   (0.80 shipped default) even under a per-node override — placement can
 *   raise the entry band but can never claim mastery. The direct
 *   `masteryThreshold` term is a local defensive clamp, not merely a
 *   consequence of the ordering invariant `masteryThreshold > abstractFade >
 *   pictorialFade` (see `src/core/mastery/mastery-config.ts`) — that
 *   invariant is unit-asserted only for `DEFAULT_MASTERY_CONFIG`, so the seed
 *   function does not depend on it holding for every per-node override.
 *
 * ASCENT CHAIN:
 *   `ascentChain` lists the generator-backed, abstract-capable graph-fixture
 *   nodes the ladder walks, foundational-first. Every entry (and
 *   `floorNodeId`) must exist in `loadGraph()` and resolve to `'available'`
 *   (see `src/config/__tests__/placement.test.ts`, which asserts this against
 *   the live graph rather than assuming it).
 */

import type { NodeId } from '@/db/types';

// ---------------------------------------------------------------------------
// PlacementConfig interface
// ---------------------------------------------------------------------------

/** Config-as-data shape for the onboarding shortened-placement ladder. */
export interface PlacementConfig {
  /**
   * Number of probes presented on a fresh run before the ladder finishes
   * naturally (all probes answered correctly).
   * Default: 3.
   */
  readonly probeCount: number;
  /**
   * The shortenable floor — placement may stop early (a non-success, or a
   * deliberately abbreviated run) after at least this many probes.
   * Never 0 here; 0 probes is the separate skip-to-floor path
   * (`PlacementController.skipToFloor()`, Phase 2), which bypasses the ladder
   * entirely rather than running a degenerate 0-probe ladder.
   * Default: 1.
   */
  readonly minProbes: number;
  /**
   * Ascending, foundational-first chain of generator-backed graph nodes the
   * ladder walks. Each node must support the `abstract` representation level
   * (only abstract-level probes can lift the mastery coordinate meaningfully
   * — see `DEFAULT_MASTERY_CONFIG.levelCeilings`).
   */
  readonly ascentChain: readonly NodeId[];
  /**
   * Entry node used by `PlacementController.skipToFloor()` when placement is
   * skipped entirely (0 probes). Conservatively low — architecturally
   * identical to a brand-new learner's default `aggregate 0 → band 0`.
   * Default: `ascentChain[0]`.
   */
  readonly floorNodeId: NodeId;
  /**
   * Target mastery-coordinate seed value for a correct probe (0..1).
   * The placement controller clamps this per node to
   * `min(seedCoordinate, resolveMasteryConfig(node).abstractFade,
   * resolveMasteryConfig(node).masteryThreshold - MASTERY_GATE_SAFETY_MARGIN)`,
   * which is structurally (locally) guaranteed to sit strictly below
   * `masteryThreshold` regardless of whether the mastery-config ordering
   * invariant holds for this node.
   * Default: 0.65 (target ≤ `abstractFade` = 0.70).
   */
  readonly seedCoordinate: number;
}

// ---------------------------------------------------------------------------
// PLACEMENT_CONFIG — shipped global default (config-as-data)
// ---------------------------------------------------------------------------

/**
 * Shipped default placement configuration.
 *
 * These are the working defaults the binary ships with. The `pedagogy-pass`
 * calibrates them later as a pure data change — the mechanism exists now.
 *
 * `ascentChain` walks the four generator-backed nodes of the stage-05
 * smoke-test fixture (`GRAPH_FIXTURE`, `graphVersion 0.2.0`), foundational
 * first: `number-bonds` (the simplest whole/part atom) before
 * `fruit-equations`, `multiplication`, and `fraction-simplification`.
 * `floorNodeId` matches `ascentChain[0]`.
 */
export const PLACEMENT_CONFIG: PlacementConfig = Object.freeze({
  probeCount: 3,
  minProbes: 1,
  ascentChain: Object.freeze([
    'number-bonds',
    'fruit-equations',
    'multiplication',
    'fraction-simplification',
  ]) as readonly NodeId[],
  floorNodeId: 'number-bonds',
  seedCoordinate: 0.65,
});
