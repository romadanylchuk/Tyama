/**
 * mastery-config.test.ts — Phase 1 unit tests for MasteryConfig + metrics helpers.
 *
 * Covers:
 *   1. Cut-point ordering invariant: masteryThreshold > abstractFade > pictorialFade
 *      (asserted on DEFAULT_MASTERY_CONFIG; must hold for any working defaults).
 *   2. resolveMasteryConfig: per-node override applied field-by-field over defaults.
 *   3. parseMasteryMetrics + serializeMasteryMetrics round-trip + unrelated-key preservation.
 */

import {
  DEFAULT_MASTERY_CONFIG,
  resolveMasteryConfig,
} from '@/core/mastery/mastery-config';
import {
  parseMasteryMetrics,
  serializeMasteryMetrics,
  seedMasteryMetrics,
} from '@/core/mastery/mastery-metrics';
import type { GraphNode } from '@/core/types';

// ---------------------------------------------------------------------------
// Helper: build a minimal GraphNode for testing
// ---------------------------------------------------------------------------

import type { MasteryConfigOverride } from '@/core/mastery/mastery-config';

function makeNode(overrides?: MasteryConfigOverride): GraphNode {
  return {
    id: 'test-node',
    prerequisites: [],
    representationLevels: ['concrete', 'pictorial', 'abstract'],
    difficultyHooks: {
      bands: [{ minCoordinate: 0, representationLevel: 'abstract', params: {} }],
      mastery: overrides,
    },
  };
}

function makeNodeNoMastery(): GraphNode {
  return {
    id: 'plain-node',
    prerequisites: [],
    representationLevels: ['abstract'],
    difficultyHooks: {
      bands: [{ minCoordinate: 0, representationLevel: 'abstract', params: {} }],
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Cut-point ordering invariant
// ---------------------------------------------------------------------------

describe('DEFAULT_MASTERY_CONFIG cut-point ordering', () => {
  it('masteryThreshold > abstractFade', () => {
    expect(DEFAULT_MASTERY_CONFIG.masteryThreshold).toBeGreaterThan(
      DEFAULT_MASTERY_CONFIG.abstractFade
    );
  });

  it('abstractFade > pictorialFade', () => {
    expect(DEFAULT_MASTERY_CONFIG.abstractFade).toBeGreaterThan(
      DEFAULT_MASTERY_CONFIG.pictorialFade
    );
  });

  it('masteryThreshold > pictorialFade (transitive)', () => {
    expect(DEFAULT_MASTERY_CONFIG.masteryThreshold).toBeGreaterThan(
      DEFAULT_MASTERY_CONFIG.pictorialFade
    );
  });

  it('shipped defaults match expected values', () => {
    expect(DEFAULT_MASTERY_CONFIG.masteryThreshold).toBe(0.8);
    expect(DEFAULT_MASTERY_CONFIG.abstractFade).toBe(0.7);
    expect(DEFAULT_MASTERY_CONFIG.pictorialFade).toBe(0.4);
  });

  it('all cut-points are in (0, 1) exclusive', () => {
    expect(DEFAULT_MASTERY_CONFIG.masteryThreshold).toBeGreaterThan(0);
    expect(DEFAULT_MASTERY_CONFIG.masteryThreshold).toBeLessThan(1);
    expect(DEFAULT_MASTERY_CONFIG.abstractFade).toBeGreaterThan(0);
    expect(DEFAULT_MASTERY_CONFIG.abstractFade).toBeLessThan(1);
    expect(DEFAULT_MASTERY_CONFIG.pictorialFade).toBeGreaterThan(0);
    expect(DEFAULT_MASTERY_CONFIG.pictorialFade).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveMasteryConfig
// ---------------------------------------------------------------------------

describe('resolveMasteryConfig', () => {
  it('returns DEFAULT_MASTERY_CONFIG when no mastery override is present', () => {
    const node = makeNodeNoMastery();
    const config = resolveMasteryConfig(node);
    expect(config).toEqual(DEFAULT_MASTERY_CONFIG);
  });

  it('applies a partial override — overridden fields use the override value', () => {
    const node = makeNode({ windowSize: 20, masteryThreshold: 0.9 });
    const config = resolveMasteryConfig(node);
    expect(config.windowSize).toBe(20);
    expect(config.masteryThreshold).toBe(0.9);
  });

  it('applies a partial override — non-overridden fields use defaults', () => {
    const node = makeNode({ windowSize: 20 });
    const config = resolveMasteryConfig(node);
    expect(config.speedFloor).toBe(DEFAULT_MASTERY_CONFIG.speedFloor);
    expect(config.targetMs).toBe(DEFAULT_MASTERY_CONFIG.targetMs);
    expect(config.abstractFade).toBe(DEFAULT_MASTERY_CONFIG.abstractFade);
    expect(config.pictorialFade).toBe(DEFAULT_MASTERY_CONFIG.pictorialFade);
    expect(config.levelCeilings).toEqual(DEFAULT_MASTERY_CONFIG.levelCeilings);
  });

  it('applies a speedFloor override', () => {
    const node = makeNode({ speedFloor: 0.5 });
    const config = resolveMasteryConfig(node);
    expect(config.speedFloor).toBe(0.5);
  });

  it('applies a targetMs override', () => {
    const node = makeNode({ targetMs: 3000 });
    const config = resolveMasteryConfig(node);
    expect(config.targetMs).toBe(3000);
  });

  it('applies abstractFade and pictorialFade overrides independently', () => {
    const node = makeNode({ abstractFade: 0.65, pictorialFade: 0.35 });
    const config = resolveMasteryConfig(node);
    expect(config.abstractFade).toBe(0.65);
    expect(config.pictorialFade).toBe(0.35);
    // non-overridden threshold stays at default
    expect(config.masteryThreshold).toBe(DEFAULT_MASTERY_CONFIG.masteryThreshold);
  });

  it('an empty mastery override object uses all defaults', () => {
    // {} is a valid MasteryConfigOverride (all fields optional)
    const node = makeNode({});
    const config = resolveMasteryConfig(node);
    expect(config).toEqual(DEFAULT_MASTERY_CONFIG);
  });
});

// ---------------------------------------------------------------------------
// 3. parseMasteryMetrics + serializeMasteryMetrics round-trip
// ---------------------------------------------------------------------------

describe('parseMasteryMetrics', () => {
  it('seeds empty metrics on empty string', () => {
    const { mastery, other } = parseMasteryMetrics('');
    expect(mastery).toEqual(seedMasteryMetrics());
    expect(other).toEqual({});
  });

  it('seeds empty metrics on JSON with no mastery key', () => {
    const { mastery, other } = parseMasteryMetrics(JSON.stringify({ foo: 42 }));
    expect(mastery).toEqual(seedMasteryMetrics());
    expect(other).toEqual({ foo: 42 });
  });

  it('seeds empty metrics on malformed JSON', () => {
    const { mastery, other } = parseMasteryMetrics('{not valid json');
    expect(mastery).toEqual(seedMasteryMetrics());
    expect(other).toEqual({});
  });

  it('seeds empty metrics on null-valued metrics', () => {
    const { mastery } = parseMasteryMetrics(JSON.stringify({ mastery: null }));
    expect(mastery).toEqual(seedMasteryMetrics());
  });

  it('parses a valid mastery blob correctly', () => {
    const raw = {
      mastery: {
        slices: {
          abstract: { window: [0.5, 0.7], scalar: 0.6 },
        },
        aggregate: 0.6,
      },
      otherStuff: 'preserved',
    };
    const { mastery, other } = parseMasteryMetrics(JSON.stringify(raw));
    expect(mastery.aggregate).toBe(0.6);
    expect(mastery.slices.abstract?.scalar).toBe(0.6);
    expect(mastery.slices.abstract?.window).toEqual([0.5, 0.7]);
    expect(mastery.slices.concrete).toBeUndefined();
    expect(other).toEqual({ otherStuff: 'preserved' });
  });

  it('ignores invalid window entries (filters to finite numbers)', () => {
    const raw = {
      mastery: {
        slices: {
          pictorial: { window: [0.3, 'bad', null, 0.5], scalar: 0.4 },
        },
        aggregate: 0.4,
      },
    };
    const { mastery } = parseMasteryMetrics(JSON.stringify(raw));
    expect(mastery.slices.pictorial?.window).toEqual([0.3, 0.5]);
  });
});

describe('serializeMasteryMetrics + parse round-trip', () => {
  it('round-trips an empty metrics object', () => {
    const original = seedMasteryMetrics();
    const serialized = serializeMasteryMetrics({}, original);
    const { mastery } = parseMasteryMetrics(serialized);
    expect(mastery).toEqual(original);
  });

  it('round-trips a metrics object with slice data', () => {
    const original = {
      slices: {
        abstract: { window: [0.4, 0.6, 0.8] as const, scalar: 0.6 },
      },
      aggregate: 0.6,
    };
    const serialized = serializeMasteryMetrics({}, original);
    const { mastery } = parseMasteryMetrics(serialized);
    expect(mastery.aggregate).toBe(0.6);
    expect(mastery.slices.abstract?.window).toEqual([0.4, 0.6, 0.8]);
    expect(mastery.slices.abstract?.scalar).toBe(0.6);
  });

  it('preserves unrelated metrics keys across a round-trip', () => {
    const original = seedMasteryMetrics();
    const other = { stage05Key: { dueAt: 1234567890, band: 2 }, anotherKey: 'hello' };
    const serialized = serializeMasteryMetrics(other, original);
    const { mastery: parsed, other: parsedOther } = parseMasteryMetrics(serialized);
    expect(parsed).toEqual(original);
    expect(parsedOther).toEqual(other);
  });

  it('overwrites a prior mastery value with updated data (write-through)', () => {
    // Simulate: parse → update → serialize → parse again
    const step1Json = JSON.stringify({
      mastery: { slices: { concrete: { window: [0.3], scalar: 0.3 } }, aggregate: 0.3 },
      extraKey: true,
    });
    const { mastery: m1, other: o1 } = parseMasteryMetrics(step1Json);
    expect(m1.slices.concrete?.scalar).toBe(0.3);

    // Simulate an engine push: updated mastery
    const updated = {
      slices: {
        concrete: { window: [0.3, 0.4] as const, scalar: 0.35 },
      },
      aggregate: 0.35,
    };
    const step2Json = serializeMasteryMetrics(o1, updated);
    const { mastery: m2, other: o2 } = parseMasteryMetrics(step2Json);
    expect(m2.slices.concrete?.scalar).toBe(0.35);
    expect(m2.slices.concrete?.window).toEqual([0.3, 0.4]);
    expect(o2).toEqual({ extraKey: true });
  });
});

// ---------------------------------------------------------------------------
// 4. DifficultyHooks.mastery — GRAPH_FIXTURE still compiles (type-level)
// ---------------------------------------------------------------------------
// This is verified by `npx tsc --noEmit`. The GRAPH_FIXTURE has no `mastery`
// key, which is valid because the field is optional. No runtime test needed.

describe('DifficultyHooks additive optional mastery field', () => {
  it('a node without a mastery field resolves to default config', () => {
    // This is the "GRAPH_FIXTURE compiles unchanged" assertion at runtime:
    // a node with no mastery override must always return defaults.
    const node = makeNodeNoMastery();
    const config = resolveMasteryConfig(node);
    expect(config.masteryThreshold).toBe(DEFAULT_MASTERY_CONFIG.masteryThreshold);
    expect(config.windowSize).toBe(DEFAULT_MASTERY_CONFIG.windowSize);
    expect(config.levelCeilings.abstract).toBe(DEFAULT_MASTERY_CONFIG.levelCeilings.abstract);
  });
});
