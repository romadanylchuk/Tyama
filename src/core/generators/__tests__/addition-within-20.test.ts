/**
 * addition-within-20.test.ts — Unit tests for the addition-within-20 generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Backward-construction invariant: a + b === sum for all seeds.
 *   - expected === canonicalize(sum).
 *   - normalizationPolicy === SCALAR_INTEGER_POLICY.
 *   - inputMode per representationLevel (concrete → manipulative, pictorial → choice, abstract → number).
 *   - prompt.vars never contain the sum (the answer).
 *   - solution === steps[0].expected.
 *   - Single step emitted.
 *   - skillNode is 'addition-within-20' on task, steps, and generator.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - narrowBandParams guard rejects malformed band params.
 */

import { additionWithin20 } from '../addition-within-20';
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

describe('additionWithin20 — byte-reproducibility', () => {
  it('same seed + concrete difficulty → deep-equal GeneratedTask', () => {
    const task1 = additionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = additionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + pictorial difficulty → deep-equal GeneratedTask', () => {
    const task1 = additionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = additionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + abstract difficulty → deep-equal GeneratedTask', () => {
    const task1 = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = additionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(1));
    const task2 = additionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(9999));
    // Different seeds should produce different tasks with very high probability.
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Backward-construction invariant: a + b === sum
// ---------------------------------------------------------------------------

describe('additionWithin20 — a + b === sum invariant', () => {
  it('a + b === sum for concrete band', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = additionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { a: number; b: number; sum: number };
      expect(concrete.sum).toBe(concrete.a + concrete.b);
    }
  });

  it('a + b === sum for pictorial band', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = additionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'pictorial', params: { maxTotal: 15 } } as Band,
        createSeededRng(seed)
      ) as { a: number; b: number; sum: number };
      expect(concrete.sum).toBe(concrete.a + concrete.b);
    }
  });

  it('a + b === sum for abstract band', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = additionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 20 } } as Band,
        createSeededRng(seed)
      ) as { a: number; b: number; sum: number };
      expect(concrete.sum).toBe(concrete.a + concrete.b);
    }
  });

  it('sum is always <= maxTotal', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = additionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 15 } } as Band,
        createSeededRng(seed)
      ) as { sum: number };
      expect(concrete.sum).toBeLessThanOrEqual(15);
    }
  });

  it('sum is always >= 2 (two positive-integer addends)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = additionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 20 } } as Band,
        createSeededRng(seed)
      ) as { sum: number };
      expect(concrete.sum).toBeGreaterThanOrEqual(2);
    }
  });

  it('a is always >= 1 (positive integer)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = additionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { a: number };
      expect(concrete.a).toBeGreaterThanOrEqual(1);
    }
  });

  it('b is always >= 1 (positive integer)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = additionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { b: number };
      expect(concrete.b).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// expected === canonicalize(sum)
// ---------------------------------------------------------------------------

describe('additionWithin20 — expected matches the pre-chosen sum', () => {
  it('step.expected === canonicalize(sum) across seeds', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const concrete = additionWithin20.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 20 } } as Band,
        createSeededRng(seed)
      ) as { sum: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.sum));
    }
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('additionWithin20 — normalizationPolicy', () => {
  it('step carries SCALAR_INTEGER_POLICY', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InputMode per representationLevel
// ---------------------------------------------------------------------------

describe('additionWithin20 — inputMode per representationLevel', () => {
  it('concrete representationLevel → "manipulative" inputMode', () => {
    const task = additionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('concrete');
    expect(task.steps[0].inputMode).toBe('manipulative');
  });

  it('pictorial representationLevel → "choice" inputMode', () => {
    const task = additionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('choice');
  });

  it('abstract representationLevel → "number" inputMode', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// prompt.vars never contain the sum (the answer)
// ---------------------------------------------------------------------------

describe('additionWithin20 — prompt vars do not contain the sum', () => {
  it('step.prompt.vars carries only a and b, never the sum', () => {
    const task = additionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const stepVars = task.steps[0].prompt.vars ?? {};
    expect('a' in stepVars).toBe(true);
    expect('b' in stepVars).toBe(true);
    expect('sum' in stepVars).toBe(false);
    // The sum is reconstructible from a + b (that's fine — it's math), but the
    // step.expected value must never appear directly by name as a var.
    const answerValue = parseInt(task.steps[0].expected, 10);
    expect(stepVars.a).not.toBe(answerValue);
    expect(stepVars.b).not.toBe(answerValue);
  });

  it('problem.prompt.vars carries only a and b, never the sum', () => {
    const task = additionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const problemVars = task.problem.prompt.vars ?? {};
    expect('a' in problemVars).toBe(true);
    expect('b' in problemVars).toBe(true);
    expect('sum' in problemVars).toBe(false);
  });

  it('problem.prompt.vars matches step.prompt.vars (same known addends)', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.vars).toEqual(task.steps[0].prompt.vars);
  });
});

// ---------------------------------------------------------------------------
// solution === steps[0].expected
// ---------------------------------------------------------------------------

describe('additionWithin20 — solution', () => {
  it('solution === steps[0].expected (single-step task)', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = additionWithin20.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[0].expected);
    }
  });

  it('solution is a canonical integer string', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// Single step
// ---------------------------------------------------------------------------

describe('additionWithin20 — single step emitted', () => {
  it('always emits exactly 1 step', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = additionWithin20.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('additionWithin20 — skillNode', () => {
  it('task.skillNode is "addition-within-20"', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('addition-within-20');
  });

  it('step.skillNode is "addition-within-20"', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('addition-within-20');
  });

  it('generator.skillNode is "addition-within-20"', () => {
    expect(additionWithin20.skillNode).toBe('addition-within-20');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('additionWithin20 — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with the expected key', () => {
    const task = additionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('addition_20.problem');
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('step.prompt is a LocalizedRef with the expected key', () => {
    const task = additionWithin20.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('addition_20.step.sum');
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('additionWithin20 — elicitFromMastery propagation', () => {
  it('step.elicitFromMastery equals difficulty.elicitFromMastery', () => {
    const task = additionWithin20.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at the concrete band', () => {
    const task = additionWithin20.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('additionWithin20.instantiate()', () => {
  it('returns an object with a, b, sum', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxTotal: 15 },
    };
    const result = additionWithin20.instantiate(band, createSeededRng(FIXED_SEED)) as {
      a: number;
      b: number;
      sum: number;
    };
    expect(typeof result.a).toBe('number');
    expect(typeof result.b).toBe('number');
    expect(typeof result.sum).toBe('number');
    expect(result.sum).toBe(result.a + result.b);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxTotal: 10 },
    };
    const r1 = additionWithin20.instantiate(band, createSeededRng(7)) as { a: number; b: number; sum: number };
    const r2 = additionWithin20.instantiate(band, createSeededRng(7)) as { a: number; b: number; sum: number };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('additionWithin20 — narrowBandParams guard', () => {
  it('throws for missing maxTotal', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: {}, // missing maxTotal
    };
    expect(() => additionWithin20.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[addition-within-20] Band params have unexpected shape'
    );
  });

  it('throws for non-object params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: 'not-an-object',
    };
    expect(() => additionWithin20.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[addition-within-20] Band params have unexpected shape'
    );
  });
});
