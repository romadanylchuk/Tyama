/**
 * word-problems.test.ts — Unit tests for the word-problems generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Backward-construction invariants: total === k * p, m === total + x,
 *     change x is always in [1, 10] and never negative.
 *   - step[0].expected === canonicalize(total), step[1].expected === canonicalize(x).
 *   - normalizationPolicy === SCALAR_INTEGER_POLICY on both steps.
 *   - inputMode === 'number' for every band (concrete/pictorial/abstract).
 *   - prompt.vars never leak an answer (total step never carries total or x;
 *     change step never carries total or x).
 *   - solution === steps[1].expected (the change is the task's overall answer).
 *   - Exactly 2 ordered steps emitted.
 *   - step[0] carries a recap label; step[1] does not.
 *   - skillNode is 'word-problems' on task, both steps, and generator.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - narrowBandParams guard rejects malformed band params.
 */

import { wordProblems } from '../word-problems';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the suggested band defaults)
// ---------------------------------------------------------------------------

/** Band 0: abstract, maxItems 3, maxPrice 5. */
const BAND_0_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 0,
  params: { maxItems: 3, maxPrice: 5 },
};

/** Band 1: abstract, maxItems 5, maxPrice 9. */
const BAND_1_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 0.5,
  params: { maxItems: 5, maxPrice: 9 },
};

/** A concrete-representation difficulty, to verify inputMode stays 'number'. */
const CONCRETE_DIFFICULTY: DifficultyParams = {
  representationLevel: 'concrete',
  elicitFromMastery: 0,
  params: { maxItems: 3, maxPrice: 5 },
};

/** A pictorial-representation difficulty, to verify inputMode stays 'number'. */
const PICTORIAL_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0.5,
  params: { maxItems: 3, maxPrice: 5 },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('wordProblems — byte-reproducibility', () => {
  it('same seed + band-0 difficulty → deep-equal GeneratedTask', () => {
    const task1 = wordProblems.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = wordProblems.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + band-1 difficulty → deep-equal GeneratedTask', () => {
    const task1 = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(1));
    const task2 = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(9999));
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Backward-construction invariants
// ---------------------------------------------------------------------------

describe('wordProblems — total === k * p and m === total + x invariants', () => {
  it('total === k * p for band 0 params', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = wordProblems.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxItems: 3, maxPrice: 5 } } as Band,
        createSeededRng(seed)
      ) as { k: number; p: number; total: number };
      expect(concrete.total).toBe(concrete.k * concrete.p);
    }
  });

  it('m === total + x for band 1 params', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = wordProblems.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxItems: 5, maxPrice: 9 } } as Band,
        createSeededRng(seed)
      ) as { total: number; x: number; m: number };
      expect(concrete.m).toBe(concrete.total + concrete.x);
    }
  });

  it('k is always within [2, maxItems]', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = wordProblems.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxItems: 5, maxPrice: 9 } } as Band,
        createSeededRng(seed)
      ) as { k: number };
      expect(concrete.k).toBeGreaterThanOrEqual(2);
      expect(concrete.k).toBeLessThanOrEqual(5);
    }
  });

  it('p is always within [2, maxPrice]', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = wordProblems.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxItems: 5, maxPrice: 9 } } as Band,
        createSeededRng(seed)
      ) as { p: number };
      expect(concrete.p).toBeGreaterThanOrEqual(2);
      expect(concrete.p).toBeLessThanOrEqual(9);
    }
  });

  it('change x is always within [1, 10] and never negative', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = wordProblems.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxItems: 5, maxPrice: 9 } } as Band,
        createSeededRng(seed)
      ) as { x: number };
      expect(concrete.x).toBeGreaterThanOrEqual(1);
      expect(concrete.x).toBeLessThanOrEqual(10);
    }
  });

  it('m is always >= total (change is never negative)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = wordProblems.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxItems: 3, maxPrice: 5 } } as Band,
        createSeededRng(seed)
      ) as { total: number; m: number };
      expect(concrete.m).toBeGreaterThanOrEqual(concrete.total);
    }
  });
});

// ---------------------------------------------------------------------------
// expected values match the pre-chosen answers
// ---------------------------------------------------------------------------

describe('wordProblems — expected matches the pre-chosen answers', () => {
  it('steps[0].expected === canonicalize(total) across seeds', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(seed));
      const concrete = wordProblems.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxItems: 5, maxPrice: 9 } } as Band,
        createSeededRng(seed)
      ) as { total: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.total));
    }
  });

  it('steps[1].expected === canonicalize(x) across seeds', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(seed));
      const concrete = wordProblems.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxItems: 5, maxPrice: 9 } } as Band,
        createSeededRng(seed)
      ) as { x: number };
      expect(task.steps[1].expected).toBe(canonicalize(concrete.x));
    }
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('wordProblems — normalizationPolicy', () => {
  it('both steps carry SCALAR_INTEGER_POLICY', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
    expect(task.steps[1].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InputMode is 'number' for every band
// ---------------------------------------------------------------------------

describe("wordProblems — inputMode is 'number' for every band", () => {
  it('concrete representationLevel → both steps use "number" inputMode', () => {
    const task = wordProblems.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('concrete');
    expect(task.steps[0].inputMode).toBe('number');
    expect(task.steps[1].inputMode).toBe('number');
  });

  it('pictorial representationLevel → both steps use "number" inputMode', () => {
    const task = wordProblems.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('number');
    expect(task.steps[1].inputMode).toBe('number');
  });

  it('abstract representationLevel → both steps use "number" inputMode', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
    expect(task.steps[1].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// prompt.vars never leak an answer
// ---------------------------------------------------------------------------

describe('wordProblems — prompt vars never leak an answer', () => {
  it('steps[0] (total) vars carry only k and p, never total or x', () => {
    const task = wordProblems.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    const stepVars = task.steps[0].prompt.vars ?? {};
    expect('k' in stepVars).toBe(true);
    expect('p' in stepVars).toBe(true);
    expect('total' in stepVars).toBe(false);
    expect('x' in stepVars).toBe(false);
    expect('m' in stepVars).toBe(false);
  });

  it('steps[1] (change) vars carry only m, never total or x', () => {
    const task = wordProblems.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    const stepVars = task.steps[1].prompt.vars ?? {};
    expect('m' in stepVars).toBe(true);
    expect('total' in stepVars).toBe(false);
    expect('x' in stepVars).toBe(false);
    expect('k' in stepVars).toBe(false);
    expect('p' in stepVars).toBe(false);
  });

  it('problem.prompt.vars carries only k, p, m — never total or x', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    const problemVars = task.problem.prompt.vars ?? {};
    expect('k' in problemVars).toBe(true);
    expect('p' in problemVars).toBe(true);
    expect('m' in problemVars).toBe(true);
    expect('total' in problemVars).toBe(false);
    expect('x' in problemVars).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// solution === steps[1].expected (the change is the task's overall answer)
// ---------------------------------------------------------------------------

describe('wordProblems — solution', () => {
  it('solution === steps[1].expected (the change)', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, BAND_1_DIFFICULTY]) {
      const task = wordProblems.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[1].expected);
    }
  });

  it('solution is a canonical integer string', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// Exactly 2 ordered steps
// ---------------------------------------------------------------------------

describe('wordProblems — two ordered steps emitted', () => {
  it('always emits exactly 2 steps', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, BAND_1_DIFFICULTY]) {
      const task = wordProblems.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(2);
    }
  });

  it('step order is [total, change]', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('word_problems.step.total');
    expect(task.steps[1].prompt.key).toBe('word_problems.step.change');
  });
});

// ---------------------------------------------------------------------------
// recap labels
// ---------------------------------------------------------------------------

describe('wordProblems — recap labels', () => {
  it('steps[0] (total) carries a recap label', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].recap).toBeDefined();
    expect(task.steps[0].recap?.key).toBe('word_problems.recap.total');
  });

  it('steps[1] (change) does not carry a recap label (last step)', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[1].recap).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('wordProblems — skillNode', () => {
  it('task.skillNode is "word-problems"', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('word-problems');
  });

  it('both steps carry skillNode "word-problems"', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('word-problems');
    expect(task.steps[1].skillNode).toBe('word-problems');
  });

  it('generator.skillNode is "word-problems"', () => {
    expect(wordProblems.skillNode).toBe('word-problems');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('wordProblems — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with the expected key', () => {
    const task = wordProblems.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('word_problems.problem');
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('steps[0].prompt is a LocalizedRef with the expected key', () => {
    const task = wordProblems.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('word_problems.step.total');
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('steps[1].prompt is a LocalizedRef with the expected key', () => {
    const task = wordProblems.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[1].prompt.key).toBe('word_problems.step.change');
    expect(task.steps[1].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('wordProblems — elicitFromMastery propagation', () => {
  it('both steps.elicitFromMastery equal difficulty.elicitFromMastery', () => {
    const task = wordProblems.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(BAND_1_DIFFICULTY.elicitFromMastery);
    expect(task.steps[1].elicitFromMastery).toBe(BAND_1_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at band 0', () => {
    const task = wordProblems.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
    expect(task.steps[1].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('wordProblems.instantiate()', () => {
  it('returns an object with k, p, total, x, m', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxItems: 5, maxPrice: 9 },
    };
    const result = wordProblems.instantiate(band, createSeededRng(FIXED_SEED)) as {
      k: number;
      p: number;
      total: number;
      x: number;
      m: number;
    };
    expect(typeof result.k).toBe('number');
    expect(typeof result.p).toBe('number');
    expect(typeof result.total).toBe('number');
    expect(typeof result.x).toBe('number');
    expect(typeof result.m).toBe('number');
    expect(result.total).toBe(result.k * result.p);
    expect(result.m).toBe(result.total + result.x);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxItems: 3, maxPrice: 5 },
    };
    const r1 = wordProblems.instantiate(band, createSeededRng(7));
    const r2 = wordProblems.instantiate(band, createSeededRng(7));
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('wordProblems — narrowBandParams guard', () => {
  it('throws for missing maxItems', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { maxPrice: 5 }, // missing maxItems
    };
    expect(() => wordProblems.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[word-problems] Band params have unexpected shape'
    );
  });

  it('throws for missing maxPrice', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { maxItems: 3 }, // missing maxPrice
    };
    expect(() => wordProblems.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[word-problems] Band params have unexpected shape'
    );
  });

  it('throws for non-object params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: 'not-an-object',
    };
    expect(() => wordProblems.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[word-problems] Band params have unexpected shape'
    );
  });
});
