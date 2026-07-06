/**
 * placement-seed.test.ts — tests for src/ui/onboarding/placement-seed.ts
 * (stage 07, Phase 2).
 *
 * Verifies:
 * - v <= abstractFade and v < masteryThreshold, for the shipped default
 *   config and for a node whose per-node override lowers abstractFade.
 * - aggregate === the single abstract slice's scalar.
 * - a priorAggregate ABOVE the target seed is preserved (never lowered).
 * - a priorAggregate BELOW the target seed is raised to the target.
 * - only the `abstract` slice is populated.
 * - the local defensive clamp holds `seed.aggregate < masteryThreshold` even
 *   for a hypothetical node config that violates the
 *   `masteryThreshold > abstractFade` ordering invariant.
 */

import { buildPlacementSeed } from '../placement-seed';
import { DEFAULT_MASTERY_CONFIG, resolveMasteryConfig } from '@/core/mastery/mastery-config';
import type { MasteryConfig } from '@/core/mastery/mastery-config';
import type { GraphNode } from '@/core/types';

const TARGET = 0.65; // mirrors PLACEMENT_CONFIG.seedCoordinate

describe('buildPlacementSeed — default config, no prior aggregate', () => {
  it('seeds v = min(target, abstractFade), strictly below masteryThreshold', () => {
    const seed = buildPlacementSeed(DEFAULT_MASTERY_CONFIG, TARGET);

    expect(seed.aggregate).toBeLessThanOrEqual(DEFAULT_MASTERY_CONFIG.abstractFade);
    expect(seed.aggregate).toBeLessThan(DEFAULT_MASTERY_CONFIG.masteryThreshold);
    expect(seed.aggregate).toBe(Math.min(TARGET, DEFAULT_MASTERY_CONFIG.abstractFade));
  });

  it('aggregate equals the single abstract slice scalar', () => {
    const seed = buildPlacementSeed(DEFAULT_MASTERY_CONFIG, TARGET);
    expect(seed.slices.abstract).toBeDefined();
    expect(seed.aggregate).toBe(seed.slices.abstract!.scalar);
    expect(seed.slices.abstract!.window).toEqual([seed.aggregate]);
  });

  it('only the abstract slice is populated', () => {
    const seed = buildPlacementSeed(DEFAULT_MASTERY_CONFIG, TARGET);
    expect(Object.keys(seed.slices)).toEqual(['abstract']);
    expect(seed.slices.concrete).toBeUndefined();
    expect(seed.slices.pictorial).toBeUndefined();
  });
});

describe('buildPlacementSeed — per-node override lowering abstractFade', () => {
  const overriddenNode: GraphNode = {
    id: 'test-lowered-fade-node',
    prerequisites: [],
    representationLevels: ['abstract'],
    difficultyHooks: {
      bands: [{ minCoordinate: 0, representationLevel: 'abstract', params: {} }],
      mastery: { abstractFade: 0.5 },
    },
  };
  const nodeConfig = resolveMasteryConfig(overriddenNode);

  it('clamps to the lowered abstractFade, still strictly below masteryThreshold', () => {
    const seed = buildPlacementSeed(nodeConfig, TARGET);
    expect(seed.aggregate).toBe(0.5);
    expect(seed.aggregate).toBeLessThanOrEqual(nodeConfig.abstractFade);
    expect(seed.aggregate).toBeLessThan(nodeConfig.masteryThreshold);
  });
});

describe('buildPlacementSeed — priorAggregate never lowered (raise-or-hold)', () => {
  it('preserves a priorAggregate ABOVE the clamped target', () => {
    const seed = buildPlacementSeed(DEFAULT_MASTERY_CONFIG, TARGET, 0.9);
    expect(seed.aggregate).toBe(0.9);
    expect(seed.slices.abstract!.window).toEqual([0.9]);
  });

  it('raises a priorAggregate BELOW the clamped target to the target', () => {
    const seed = buildPlacementSeed(DEFAULT_MASTERY_CONFIG, TARGET, 0.2);
    expect(seed.aggregate).toBe(Math.min(TARGET, DEFAULT_MASTERY_CONFIG.abstractFade));
  });

  it('treats an absent priorAggregate as 0', () => {
    const seed = buildPlacementSeed(DEFAULT_MASTERY_CONFIG, TARGET, undefined);
    expect(seed.aggregate).toBe(Math.min(TARGET, DEFAULT_MASTERY_CONFIG.abstractFade));
  });
});

describe('buildPlacementSeed — local defensive clamp against a hypothetical bad-ordering node config', () => {
  // Review finding: the mastery-gate-safety guarantee must not depend solely
  // on the global ordering invariant (masteryThreshold > abstractFade), which
  // is unit-asserted only for DEFAULT_MASTERY_CONFIG — nothing validates a
  // future per-node difficultyHooks.mastery override against it. This config
  // deliberately VIOLATES the ordering (abstractFade > masteryThreshold) to
  // prove buildPlacementSeed clamps against masteryThreshold directly rather
  // than trusting abstractFade to already be below it.
  const badOrderingConfig: MasteryConfig = {
    ...DEFAULT_MASTERY_CONFIG,
    masteryThreshold: 0.8,
    abstractFade: 0.9, // violates masteryThreshold > abstractFade
  };

  it('keeps seed.aggregate strictly below masteryThreshold even though abstractFade exceeds it', () => {
    // A target between masteryThreshold and the (too-high) abstractFade would,
    // without the local clamp, pass straight through the abstractFade clamp
    // and land at/above masteryThreshold.
    const seed = buildPlacementSeed(badOrderingConfig, 0.85);
    expect(seed.aggregate).toBeLessThan(badOrderingConfig.masteryThreshold);
  });

  it('still clamps correctly when the target exceeds both cut-points', () => {
    const seed = buildPlacementSeed(badOrderingConfig, 0.99);
    expect(seed.aggregate).toBeLessThan(badOrderingConfig.masteryThreshold);
  });

  it('does not re-clamp a priorAggregate already at/above masteryThreshold (raise-or-hold is unaffected)', () => {
    // The defensive clamp applies only to this function's OWN contribution,
    // never to an existing priorAggregate — raise-or-hold semantics (tested
    // above for the default config) must hold unchanged here too.
    const seed = buildPlacementSeed(badOrderingConfig, 0.85, 0.95);
    expect(seed.aggregate).toBe(0.95);
  });
});
