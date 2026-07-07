/**
 * rounding.test.ts — Unit tests for the rounding-to-nearest-10 generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Backward-construction invariant: n = r + offset, r a multiple of 10.
 *   - offset never equals +-5 (half-up ambiguity excluded).
 *   - r is the unique nearest multiple of 10 to n.
 *   - expected === canonicalize(r).
 *   - normalizationPolicy === SCALAR_INTEGER_POLICY.
 *   - inputMode per representationLevel (pictorial → choice, abstract → number).
 *   - prompt.vars never contain r (the answer).
 *   - solution === steps[0].expected.
 *   - Single step emitted.
 *   - skillNode is 'rounding' on task, steps, and generator.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - narrowBandParams guard rejects malformed band params.
 *   - n is always >= 1.
 */

import { rounding } from '../rounding';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the shipped CPA ladder defaults)
// ---------------------------------------------------------------------------

/** Band 0: pictorial, maxBase 5 (choice inputMode). r in {10,...,50}. */
const PICTORIAL_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0,
  params: { maxBase: 5 },
};

/** Band 1: abstract, maxBase 9 (number inputMode). r in {10,...,90}. */
const ABSTRACT_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 0.5,
  params: { maxBase: 9 },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('rounding — byte-reproducibility', () => {
  it('same seed + pictorial difficulty → deep-equal GeneratedTask', () => {
    const task1 = rounding.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = rounding.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + abstract difficulty → deep-equal GeneratedTask', () => {
    const task1 = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(1));
    const task2 = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(9999));
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Backward-construction invariant: n = r + offset, r a multiple of 10
// ---------------------------------------------------------------------------

describe('rounding — n = r + offset invariant', () => {
  it('r is always a positive multiple of 10 for pictorial band', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = rounding.instantiate(
        { minCoordinate: 0, representationLevel: 'pictorial', params: { maxBase: 5 } } as Band,
        createSeededRng(seed)
      ) as { n: number; r: number };
      expect(concrete.r % 10).toBe(0);
      expect(concrete.r).toBeGreaterThanOrEqual(10);
      expect(concrete.r).toBeLessThanOrEqual(50);
    }
  });

  it('r is always a positive multiple of 10 for abstract band', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = rounding.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxBase: 9 } } as Band,
        createSeededRng(seed)
      ) as { n: number; r: number };
      expect(concrete.r % 10).toBe(0);
      expect(concrete.r).toBeGreaterThanOrEqual(10);
      expect(concrete.r).toBeLessThanOrEqual(90);
    }
  });

  it('offset (n - r) is always within [-4, 4]', () => {
    for (let seed = 0; seed < 50; seed++) {
      const concrete = rounding.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxBase: 9 } } as Band,
        createSeededRng(seed)
      ) as { n: number; r: number };
      const offset = concrete.n - concrete.r;
      expect(offset).toBeGreaterThanOrEqual(-4);
      expect(offset).toBeLessThanOrEqual(4);
    }
  });

  it('offset never equals +5 or -5 (half-up ambiguity excluded)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const concrete = rounding.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxBase: 9 } } as Band,
        createSeededRng(seed)
      ) as { n: number; r: number };
      const offset = concrete.n - concrete.r;
      expect(offset).not.toBe(5);
      expect(offset).not.toBe(-5);
    }
  });

  it('r is the unique nearest multiple of 10 to n', () => {
    for (let seed = 0; seed < 50; seed++) {
      const concrete = rounding.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxBase: 9 } } as Band,
        createSeededRng(seed)
      ) as { n: number; r: number };
      const nearest = Math.round(concrete.n / 10) * 10;
      expect(concrete.r).toBe(nearest);
      // Distance to r must be strictly less than distance to any other multiple of 10.
      const distToR = Math.abs(concrete.n - concrete.r);
      expect(distToR).toBeLessThan(5);
      expect(distToR).toBeLessThan(Math.abs(concrete.n - (concrete.r - 10)));
      expect(distToR).toBeLessThan(Math.abs(concrete.n - (concrete.r + 10)));
    }
  });

  it('n is always >= 1', () => {
    for (let seed = 0; seed < 50; seed++) {
      const concrete = rounding.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxBase: 9 } } as Band,
        createSeededRng(seed)
      ) as { n: number };
      expect(concrete.n).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// expected === canonicalize(r)
// ---------------------------------------------------------------------------

describe('rounding — expected matches the pre-chosen rounded value', () => {
  it('step.expected === canonicalize(r) across seeds', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const concrete = rounding.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxBase: 9 } } as Band,
        createSeededRng(seed)
      ) as { r: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.r));
    }
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('rounding — normalizationPolicy', () => {
  it('step carries SCALAR_INTEGER_POLICY', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InputMode per representationLevel
// ---------------------------------------------------------------------------

describe('rounding — inputMode per representationLevel', () => {
  it('pictorial representationLevel → "choice" inputMode', () => {
    const task = rounding.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('choice');
  });

  it('abstract representationLevel → "number" inputMode', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// prompt.vars never contain r (the answer)
// ---------------------------------------------------------------------------

describe('rounding — prompt vars do not contain the rounded value', () => {
  it('step.prompt.vars carries only n, never r', () => {
    const task = rounding.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const stepVars = task.steps[0].prompt.vars ?? {};
    expect('n' in stepVars).toBe(true);
    expect('r' in stepVars).toBe(false);
    const answerValue = parseInt(task.steps[0].expected, 10);
    // n and r may coincidentally differ by at most 4; ensure vars.n is never
    // literally the answer value (n === r is possible only when offset === 0,
    // which is allowed — this assertion instead checks the answer field name,
    // covered structurally by the 'r' in stepVars check above).
    expect(typeof stepVars.n).toBe('number');
    void answerValue;
  });

  it('problem.prompt.vars carries only n, never r', () => {
    const task = rounding.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const problemVars = task.problem.prompt.vars ?? {};
    expect('n' in problemVars).toBe(true);
    expect('r' in problemVars).toBe(false);
  });

  it('problem.prompt.vars matches step.prompt.vars (same known n)', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.vars).toEqual(task.steps[0].prompt.vars);
  });
});

// ---------------------------------------------------------------------------
// solution === steps[0].expected
// ---------------------------------------------------------------------------

describe('rounding — solution', () => {
  it('solution === steps[0].expected (single-step task)', () => {
    for (const difficulty of [PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = rounding.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[0].expected);
    }
  });

  it('solution is a canonical integer string', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// Single step
// ---------------------------------------------------------------------------

describe('rounding — single step emitted', () => {
  it('always emits exactly 1 step', () => {
    for (const difficulty of [PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = rounding.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('rounding — skillNode', () => {
  it('task.skillNode is "rounding"', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('rounding');
  });

  it('step.skillNode is "rounding"', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('rounding');
  });

  it('generator.skillNode is "rounding"', () => {
    expect(rounding.skillNode).toBe('rounding');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('rounding — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with the expected key', () => {
    const task = rounding.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('rounding.problem');
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('step.prompt is a LocalizedRef with the expected key', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('rounding.step.rounded');
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('rounding — elicitFromMastery propagation', () => {
  it('step.elicitFromMastery equals difficulty.elicitFromMastery', () => {
    const task = rounding.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at the pictorial band', () => {
    const task = rounding.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('rounding.instantiate()', () => {
  it('returns an object with n, r', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxBase: 9 },
    };
    const result = rounding.instantiate(band, createSeededRng(FIXED_SEED)) as {
      n: number;
      r: number;
    };
    expect(typeof result.n).toBe('number');
    expect(typeof result.r).toBe('number');
    expect(result.r % 10).toBe(0);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxBase: 9 },
    };
    const r1 = rounding.instantiate(band, createSeededRng(7)) as { n: number; r: number };
    const r2 = rounding.instantiate(band, createSeededRng(7)) as { n: number; r: number };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('rounding — narrowBandParams guard', () => {
  it('throws for missing maxBase', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: {}, // missing maxBase
    };
    expect(() => rounding.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[rounding] Band params have unexpected shape'
    );
  });

  it('throws for non-object params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: 'not-an-object',
    };
    expect(() => rounding.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[rounding] Band params have unexpected shape'
    );
  });
});
