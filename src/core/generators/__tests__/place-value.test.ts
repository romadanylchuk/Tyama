/**
 * place-value.test.ts — Unit tests for the place-value generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Backward-construction invariant: n === 10 * tens + ones for all seeds.
 *   - expected === canonicalize(tens) / canonicalize(ones).
 *   - normalizationPolicy === SCALAR_INTEGER_POLICY.
 *   - inputMode per representationLevel (concrete → tokens, abstract → number).
 *   - prompt.vars carry only `n` (never tens or ones).
 *   - solution === canonicalize(n).
 *   - Exactly two ordered steps (tens, then ones).
 *   - Recap labels on both steps.
 *   - skillNode is 'place-value' on task, steps, and generator.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - narrowBandParams guard rejects malformed band params.
 */

import { placeValue } from '../place-value';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the suggested band defaults)
// ---------------------------------------------------------------------------

/** Band 0: concrete, maxTens 5 (tokens inputMode). */
const CONCRETE_DIFFICULTY: DifficultyParams = {
  representationLevel: 'concrete',
  elicitFromMastery: 0,
  params: { maxTens: 5 },
};

/** Band 1 (pictorial, not shipped as a distinct band but exercised for the ladder). */
const PICTORIAL_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0.5,
  params: { maxTens: 7 },
};

/** Band 2: abstract, maxTens 9 (number inputMode). */
const ABSTRACT_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 1,
  params: { maxTens: 9 },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('placeValue — byte-reproducibility', () => {
  it('same seed + concrete difficulty → deep-equal GeneratedTask', () => {
    const task1 = placeValue.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = placeValue.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + pictorial difficulty → deep-equal GeneratedTask', () => {
    const task1 = placeValue.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = placeValue.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + abstract difficulty → deep-equal GeneratedTask', () => {
    const task1 = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(1));
    const task2 = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(9999));
    // Different seeds should produce different tasks with very high probability.
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Backward-construction invariant: n === 10 * tens + ones
// ---------------------------------------------------------------------------

describe('placeValue — n === 10 * tens + ones invariant', () => {
  it('n === 10 * tens + ones for concrete band', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = placeValue.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTens: 5 } } as Band,
        createSeededRng(seed)
      ) as { tens: number; ones: number; n: number };
      expect(concrete.n).toBe(10 * concrete.tens + concrete.ones);
    }
  });

  it('n === 10 * tens + ones for abstract band', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = placeValue.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTens: 9 } } as Band,
        createSeededRng(seed)
      ) as { tens: number; ones: number; n: number };
      expect(concrete.n).toBe(10 * concrete.tens + concrete.ones);
    }
  });

  it('tens is always within [1, maxTens]', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = placeValue.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTens: 5 } } as Band,
        createSeededRng(seed)
      ) as { tens: number };
      expect(concrete.tens).toBeGreaterThanOrEqual(1);
      expect(concrete.tens).toBeLessThanOrEqual(5);
    }
  });

  it('ones is always within [0, 9]', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = placeValue.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTens: 9 } } as Band,
        createSeededRng(seed)
      ) as { ones: number };
      expect(concrete.ones).toBeGreaterThanOrEqual(0);
      expect(concrete.ones).toBeLessThanOrEqual(9);
    }
  });
});

// ---------------------------------------------------------------------------
// expected === canonicalize(tens) / canonicalize(ones)
// ---------------------------------------------------------------------------

describe('placeValue — expected matches the pre-chosen digits', () => {
  it('steps[0].expected === canonicalize(tens) and steps[1].expected === canonicalize(ones)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const concrete = placeValue.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTens: 9 } } as Band,
        createSeededRng(seed)
      ) as { tens: number; ones: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.tens));
      expect(task.steps[1].expected).toBe(canonicalize(concrete.ones));
    }
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('placeValue — normalizationPolicy', () => {
  it('both steps carry SCALAR_INTEGER_POLICY', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
    expect(task.steps[1].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
    expect(task.steps[1].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
    expect(task.steps[1].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InputMode per representationLevel
// ---------------------------------------------------------------------------

describe('placeValue — inputMode per representationLevel', () => {
  it('concrete representationLevel → "tokens" inputMode on both steps', () => {
    const task = placeValue.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('concrete');
    expect(task.steps[0].inputMode).toBe('tokens');
    expect(task.steps[1].inputMode).toBe('tokens');
  });

  it('pictorial representationLevel → "number" inputMode on both steps', () => {
    const task = placeValue.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('number');
    expect(task.steps[1].inputMode).toBe('number');
  });

  it('abstract representationLevel → "number" inputMode on both steps', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
    expect(task.steps[1].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// prompt.vars carry only `n` (never tens or ones)
// ---------------------------------------------------------------------------

describe('placeValue — prompt vars carry only n', () => {
  it('steps[0].prompt.vars is exactly { n }', () => {
    const task = placeValue.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.steps[0].prompt.vars ?? {};
    expect(Object.keys(vars)).toEqual(['n']);
  });

  it('steps[1].prompt.vars is exactly { n }', () => {
    const task = placeValue.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.steps[1].prompt.vars ?? {};
    expect(Object.keys(vars)).toEqual(['n']);
  });

  it('problem.prompt.vars is exactly { n }', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.problem.prompt.vars ?? {};
    expect(Object.keys(vars)).toEqual(['n']);
  });

  it('neither step exposes tens or ones by name in vars', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect('tens' in (task.steps[0].prompt.vars ?? {})).toBe(false);
    expect('ones' in (task.steps[0].prompt.vars ?? {})).toBe(false);
    expect('tens' in (task.steps[1].prompt.vars ?? {})).toBe(false);
    expect('ones' in (task.steps[1].prompt.vars ?? {})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// solution === canonicalize(n)
// ---------------------------------------------------------------------------

describe('placeValue — solution', () => {
  it('solution === canonicalize(n)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const concrete = placeValue.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTens: 9 } } as Band,
        createSeededRng(seed)
      ) as { n: number };
      expect(task.solution).toBe(canonicalize(concrete.n));
    }
  });

  it('solution is a canonical integer string', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// Exactly two ordered steps
// ---------------------------------------------------------------------------

describe('placeValue — two ordered steps emitted', () => {
  it('always emits exactly 2 steps', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = placeValue.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(2);
    }
  });

  it('step order is tens first, then ones', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('place_value.step.tens');
    expect(task.steps[1].prompt.key).toBe('place_value.step.ones');
  });
});

// ---------------------------------------------------------------------------
// Recap labels
// ---------------------------------------------------------------------------

describe('placeValue — recap labels', () => {
  it('step 1 (tens) carries a recap label', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].recap?.key).toBe('place_value.recap.tens');
  });

  it('step 2 (ones) carries a recap label', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[1].recap?.key).toBe('place_value.recap.ones');
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('placeValue — skillNode', () => {
  it('task.skillNode is "place-value"', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('place-value');
  });

  it('both steps carry skillNode "place-value"', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('place-value');
    expect(task.steps[1].skillNode).toBe('place-value');
  });

  it('generator.skillNode is "place-value"', () => {
    expect(placeValue.skillNode).toBe('place-value');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('placeValue — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with the expected key', () => {
    const task = placeValue.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('place_value.problem');
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('steps carry the expected LocalizedRef keys', () => {
    const task = placeValue.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('place_value.step.tens');
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
    expect(task.steps[1].prompt.key).toBe('place_value.step.ones');
    expect(task.steps[1].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('placeValue — elicitFromMastery propagation', () => {
  it('both steps.elicitFromMastery equal difficulty.elicitFromMastery', () => {
    const task = placeValue.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
    expect(task.steps[1].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at the concrete band', () => {
    const task = placeValue.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
    expect(task.steps[1].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('placeValue.instantiate()', () => {
  it('returns an object with tens, ones, n', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxTens: 9 },
    };
    const result = placeValue.instantiate(band, createSeededRng(FIXED_SEED)) as {
      tens: number;
      ones: number;
      n: number;
    };
    expect(typeof result.tens).toBe('number');
    expect(typeof result.ones).toBe('number');
    expect(typeof result.n).toBe('number');
    expect(result.n).toBe(10 * result.tens + result.ones);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxTens: 9 },
    };
    const r1 = placeValue.instantiate(band, createSeededRng(7)) as { tens: number; ones: number; n: number };
    const r2 = placeValue.instantiate(band, createSeededRng(7)) as { tens: number; ones: number; n: number };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('placeValue — narrowBandParams guard', () => {
  it('throws for missing maxTens', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: {}, // missing maxTens
    };
    expect(() => placeValue.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[place-value] Band params have unexpected shape'
    );
  });

  it('throws for non-object params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: 'not-an-object',
    };
    expect(() => placeValue.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[place-value] Band params have unexpected shape'
    );
  });
});
