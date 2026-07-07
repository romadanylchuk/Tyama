/**
 * subtraction-within-20.test.ts — Unit tests for the subtraction-within-20 generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Backward-construction invariant: m - s === d for all seeds.
 *   - expected === canonicalize(d).
 *   - normalizationPolicy === SCALAR_INTEGER_POLICY.
 *   - inputMode per representationLevel (concrete → manipulative, pictorial → choice, abstract → number).
 *   - prompt.vars never contain the difference (the answer).
 *   - solution === steps[0].expected.
 *   - Single step emitted.
 *   - skillNode is 'subtraction-within-20' on task, steps, and generator.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - narrowBandParams guard rejects malformed band params.
 */

import { subtractionWithin20 } from '../subtraction-within-20';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the shipped CPA ladder defaults)
// ---------------------------------------------------------------------------

/** Band 0: concrete, maxTotal 10 (manipulative inputMode). */
const CONCRETE_DIFFICULTY: DifficultyParams = {
  representationLevel: 'concrete',
  elicitFromMastery: 0,
  params: { maxTotal: 10 },
};

/** Band 1: pictorial, maxTotal 15 (choice inputMode). */
const PICTORIAL_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0.5,
  params: { maxTotal: 15 },
};

/** Band 2: abstract, maxTotal 20 (number inputMode). */
const ABSTRACT_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 1,
  params: { maxTotal: 20 },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — byte-reproducibility', () => {
  it('same seed + concrete difficulty → deep-equal GeneratedTask', () => {
    const task1 = subtractionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = subtractionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + pictorial difficulty → deep-equal GeneratedTask', () => {
    const task1 = subtractionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = subtractionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + abstract difficulty → deep-equal GeneratedTask', () => {
    const task1 = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = subtractionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(1));
    const task2 = subtractionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(9999));
    // Different seeds should produce different tasks with very high probability.
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Backward-construction invariant: m - s === d
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — m - s === d invariant', () => {
  it('m - s === d for concrete band', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = subtractionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { m: number; s: number; d: number };
      expect(concrete.d).toBe(concrete.m - concrete.s);
    }
  });

  it('m - s === d for pictorial band', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = subtractionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'pictorial', params: { maxTotal: 15 } } as Band,
        createSeededRng(seed)
      ) as { m: number; s: number; d: number };
      expect(concrete.d).toBe(concrete.m - concrete.s);
    }
  });

  it('m - s === d for abstract band', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = subtractionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 20 } } as Band,
        createSeededRng(seed)
      ) as { m: number; s: number; d: number };
      expect(concrete.d).toBe(concrete.m - concrete.s);
    }
  });

  it('minuend m is always <= maxTotal', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = subtractionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 15 } } as Band,
        createSeededRng(seed)
      ) as { m: number };
      expect(concrete.m).toBeLessThanOrEqual(15);
    }
  });

  it('difference d is always >= 1', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = subtractionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 20 } } as Band,
        createSeededRng(seed)
      ) as { d: number };
      expect(concrete.d).toBeGreaterThanOrEqual(1);
    }
  });

  it('subtrahend s is always >= 1 (positive integer)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = subtractionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { s: number };
      expect(concrete.s).toBeGreaterThanOrEqual(1);
    }
  });

  it('minuend m is always >= 2 (subtrahend + difference, both >= 1)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = subtractionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { m: number };
      expect(concrete.m).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// expected === canonicalize(d)
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — expected matches the pre-chosen difference', () => {
  it('step.expected === canonicalize(d) across seeds', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const concrete = subtractionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 20 } } as Band,
        createSeededRng(seed)
      ) as { d: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.d));
    }
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — normalizationPolicy', () => {
  it('step carries SCALAR_INTEGER_POLICY', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InputMode per representationLevel
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — inputMode per representationLevel', () => {
  it('concrete representationLevel → "manipulative" inputMode', () => {
    const task = subtractionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('concrete');
    expect(task.steps[0].inputMode).toBe('manipulative');
  });

  it('pictorial representationLevel → "choice" inputMode', () => {
    const task = subtractionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('choice');
  });

  it('abstract representationLevel → "number" inputMode', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// prompt.vars never contain the difference (the answer)
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — prompt vars do not contain the difference', () => {
  it('step.prompt.vars carries only m and s, never the difference', () => {
    const task = subtractionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const stepVars = task.steps[0].prompt.vars ?? {};
    expect('m' in stepVars).toBe(true);
    expect('s' in stepVars).toBe(true);
    expect('d' in stepVars).toBe(false);
    // The difference is reconstructible from m - s (that's fine — it's math),
    // but the step.expected value must never appear directly by name as a var.
    const answerValue = parseInt(task.steps[0].expected, 10);
    expect(stepVars.m).not.toBe(answerValue);
    expect(stepVars.s).not.toBe(answerValue);
  });

  it('problem.prompt.vars carries only m and s, never the difference', () => {
    const task = subtractionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const problemVars = task.problem.prompt.vars ?? {};
    expect('m' in problemVars).toBe(true);
    expect('s' in problemVars).toBe(true);
    expect('d' in problemVars).toBe(false);
  });

  it('problem.prompt.vars matches step.prompt.vars (same known minuend/subtrahend)', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.vars).toEqual(task.steps[0].prompt.vars);
  });
});

// ---------------------------------------------------------------------------
// solution === steps[0].expected
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — solution', () => {
  it('solution === steps[0].expected (single-step task)', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = subtractionWithin20.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[0].expected);
    }
  });

  it('solution is a canonical integer string', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// Single step
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — single step emitted', () => {
  it('always emits exactly 1 step', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = subtractionWithin20.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — skillNode', () => {
  it('task.skillNode is "subtraction-within-20"', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('subtraction-within-20');
  });

  it('step.skillNode is "subtraction-within-20"', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('subtraction-within-20');
  });

  it('generator.skillNode is "subtraction-within-20"', () => {
    expect(subtractionWithin20.skillNode).toBe('subtraction-within-20');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with the expected key', () => {
    const task = subtractionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('subtraction_20.problem');
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('step.prompt is a LocalizedRef with the expected key', () => {
    const task = subtractionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('subtraction_20.step.difference');
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — elicitFromMastery propagation', () => {
  it('step.elicitFromMastery equals difficulty.elicitFromMastery', () => {
    const task = subtractionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at the concrete band', () => {
    const task = subtractionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('subtractionWithin20.instantiate()', () => {
  it('returns an object with m, s, d', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxTotal: 15 },
    };
    const result = subtractionWithin20.instantiate(band, createSeededRng(FIXED_SEED)) as {
      m: number;
      s: number;
      d: number;
    };
    expect(typeof result.m).toBe('number');
    expect(typeof result.s).toBe('number');
    expect(typeof result.d).toBe('number');
    expect(result.d).toBe(result.m - result.s);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxTotal: 10 },
    };
    const r1 = subtractionWithin20.instantiate(band, createSeededRng(7)) as { m: number; s: number; d: number };
    const r2 = subtractionWithin20.instantiate(band, createSeededRng(7)) as { m: number; s: number; d: number };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('subtractionWithin20 — narrowBandParams guard', () => {
  it('throws for missing maxTotal', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: {}, // missing maxTotal
    };
    expect(() => subtractionWithin20.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[subtraction-within-20] Band params have unexpected shape'
    );
  });

  it('throws for non-object params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: 'not-an-object',
    };
    expect(() => subtractionWithin20.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[subtraction-within-20] Band params have unexpected shape'
    );
  });
});
