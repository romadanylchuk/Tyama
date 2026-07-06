/**
 * mastery-config.ts — Config-as-data MasteryConfig type and shipped defaults.
 *
 * CONFIG-AS-DATA INVARIANT:
 *   All thresholds, ceilings, speed targets, and window sizes live here as
 *   shipped defaults. The `pedagogy-pass` calibrates these values later as a
 *   pure data change — no code change required. NEVER hardcode pedagogy values
 *   into call-site logic; always resolve through `resolveMasteryConfig`.
 *
 * PER-NODE OVERRIDE:
 *   Each `GraphNode.difficultyHooks.mastery` field (optional) may override any
 *   subset of these defaults. `resolveMasteryConfig(node)` merges the per-node
 *   override over `DEFAULT_MASTERY_CONFIG` field by field.
 *
 * CUT-POINT ORDERING INVARIANT (asserted by unit test):
 *   masteryThreshold > abstractFade > pictorialFade
 *   (0.80 > 0.70 > 0.40 for shipped defaults)
 *
 *   A node can be fading its scaffolding (above pictorial/abstract fade) while
 *   still "unmastered" for routing (below masteryThreshold). All three are on
 *   the same 0..1 scalar; their ordering is load-bearing for routing logic.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 */

import type { RepresentationLevel, GraphNode } from '@/core/types';

// ---------------------------------------------------------------------------
// MasteryConfig interface
// ---------------------------------------------------------------------------

/**
 * Per-node mastery configuration.
 *
 * All numeric values are 0..1 scalars unless otherwise noted.
 * Carried in `GraphNode.difficultyHooks.mastery` (optional per-node override)
 * or read from `DEFAULT_MASTERY_CONFIG` (global shipped default).
 */
export interface MasteryConfig {
  /**
   * Rolling window size: the number of most-recent per-attempt raw scalars
   * retained per `(node, representationLevel)` slice.
   * Older entries are evicted when the window exceeds this size.
   * Default: 12. `pedagogy-pass` may calibrate per node.
   */
  readonly windowSize: number;

  /**
   * Speed factor lower bound (0..1).
   * `speedFactor` is floor-bounded at this value — slower-than-target attempts
   * never produce a speed factor below `speedFloor`.
   * ANTI-SHAME INVARIANT: this value MUST be > 0 so correct-but-slow attempts
   * never contribute a zero raw scalar to the window.
   * Default: 0.7.
   */
  readonly speedFloor: number;

  /**
   * Per-atom target wall time in milliseconds.
   * `speedFactor` is computed relative to this value: `max(speedFloor, targetMs / elapsedMs)`.
   * Faster-than-target → speedFactor > 1 (capped); slower-than-target → speedFloor..1.
   * Per-atom (never a global ms absolute) — overridable per node via difficultyHooks.
   * Default: 6000 ms.
   */
  readonly targetMs: number;

  /**
   * Per-representation-level scalar ceiling.
   * The CPA trajectory projection: concrete automaticity earns less headroom
   * than abstract automaticity, reflecting the pedagogical ceiling of the modality.
   * Default: `{ concrete: 0.45, pictorial: 0.75, abstract: 1.0 }`.
   */
  readonly levelCeilings: Readonly<Record<RepresentationLevel, number>>;

  /**
   * Gate cut-point (0..1) for the inter-node mastery gate.
   * A prerequisite node is considered "mastered" (safe to not descend into)
   * when its aggregate scalar reaches this value.
   * ORDERING INVARIANT: masteryThreshold > abstractFade > pictorialFade.
   * Default: 0.80.
   */
  readonly masteryThreshold: number;

  /**
   * Scaffolding-fade cut-point for the abstract zone (0..1).
   * When the aggregate scalar crosses this value, abstract-level tasks transition
   * from stepped to finalOnly (speed-drill) presentation.
   * ORDERING INVARIANT: abstractFade < masteryThreshold AND abstractFade > pictorialFade.
   * Default: 0.70.
   */
  readonly abstractFade: number;

  /**
   * Scaffolding-fade cut-point for the pictorial zone (0..1).
   * When the aggregate scalar crosses this value, pictorial-level tasks transition
   * from fully-scaffolded to key-steps-only presentation.
   * ORDERING INVARIANT: pictorialFade < abstractFade.
   * Default: 0.40.
   */
  readonly pictorialFade: number;
}

// ---------------------------------------------------------------------------
// MasteryConfigOverride — partial per-node override shape
// ---------------------------------------------------------------------------

/**
 * The partial per-node mastery configuration override carried in
 * `DifficultyHooks.mastery`.
 *
 * Each field is optional — absent fields fall back to `DEFAULT_MASTERY_CONFIG`.
 * `resolveMasteryConfig(node)` merges this over the global default field-by-field.
 *
 * `levelCeilings` is itself a partial record — a node may override only the
 * concrete ceiling without specifying abstract and pictorial.
 */
export type MasteryConfigOverride = {
  readonly [K in keyof Omit<MasteryConfig, 'levelCeilings'>]?: MasteryConfig[K];
} & {
  readonly levelCeilings?: Partial<Record<RepresentationLevel, number>>;
};

// ---------------------------------------------------------------------------
// DEFAULT_MASTERY_CONFIG — shipped global fallback (config-as-data)
// ---------------------------------------------------------------------------

/**
 * Shipped default mastery configuration.
 *
 * These are the working defaults the binary ships with. The `pedagogy-pass`
 * calibrates them later as a pure data change — the mechanism exists now.
 *
 * CUT-POINT ORDERING:
 *   masteryThreshold (0.80) > abstractFade (0.70) > pictorialFade (0.40)
 *   This is a load-bearing relationship asserted by the unit test suite.
 *
 * LEVEL CEILINGS:
 *   concrete  0.45 — low-but-nonzero; concrete automaticity reflects foundational use
 *   pictorial 0.75 — mid; pictorial bridges toward abstract
 *   abstract  1.00 — full scale; abstract automaticity is the goal
 */
export const DEFAULT_MASTERY_CONFIG: MasteryConfig = Object.freeze({
  windowSize: 12,
  speedFloor: 0.7,
  targetMs: 6000,
  levelCeilings: Object.freeze({
    concrete: 0.45,
    pictorial: 0.75,
    abstract: 1.0,
  }) as Readonly<Record<RepresentationLevel, number>>,
  masteryThreshold: 0.8,
  abstractFade: 0.7,
  pictorialFade: 0.4,
} satisfies MasteryConfig);

// ---------------------------------------------------------------------------
// resolveMasteryConfig — per-node-override-over-default resolver
// ---------------------------------------------------------------------------

/**
 * resolveMasteryConfig(node: GraphNode): MasteryConfig
 *
 * Returns the effective mastery config for a graph node by spreading any
 * per-node override (from `node.difficultyHooks.mastery`) over the global
 * `DEFAULT_MASTERY_CONFIG`. Fields absent in the override use the default.
 *
 * This is the single site that applies per-node pedagogy overrides. All stage-04
 * code must resolve config through this function — never read
 * `DEFAULT_MASTERY_CONFIG` directly in engine or routing logic.
 *
 * @param node - The graph node whose effective mastery config is needed.
 * @returns    - A frozen `MasteryConfig` merging the node override over defaults.
 */
export function resolveMasteryConfig(node: GraphNode): MasteryConfig {
  const override = node.difficultyHooks.mastery;
  if (override === undefined) {
    return DEFAULT_MASTERY_CONFIG;
  }
  // Merge per-field. `levelCeilings` is a nested object — merge it separately
  // so a partial ceiling override does not silently zero out the other levels.
  return Object.freeze({
    windowSize: override.windowSize ?? DEFAULT_MASTERY_CONFIG.windowSize,
    speedFloor: override.speedFloor ?? DEFAULT_MASTERY_CONFIG.speedFloor,
    targetMs: override.targetMs ?? DEFAULT_MASTERY_CONFIG.targetMs,
    levelCeilings: Object.freeze({
      concrete:
        override.levelCeilings?.concrete ?? DEFAULT_MASTERY_CONFIG.levelCeilings.concrete,
      pictorial:
        override.levelCeilings?.pictorial ?? DEFAULT_MASTERY_CONFIG.levelCeilings.pictorial,
      abstract:
        override.levelCeilings?.abstract ?? DEFAULT_MASTERY_CONFIG.levelCeilings.abstract,
    }) as Readonly<Record<RepresentationLevel, number>>,
    masteryThreshold: override.masteryThreshold ?? DEFAULT_MASTERY_CONFIG.masteryThreshold,
    abstractFade: override.abstractFade ?? DEFAULT_MASTERY_CONFIG.abstractFade,
    pictorialFade: override.pictorialFade ?? DEFAULT_MASTERY_CONFIG.pictorialFade,
  } satisfies MasteryConfig);
}
