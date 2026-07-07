/**
 * multiplication.test.ts — Unit tests for the multiplication generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Product invariant: product === factorA * factorB for all seeds.
 *   - Single step emitted.
 *   - inputMode is always 'number' (no CPA variation).
 *   - expected === canonicalize(product) with SCALAR_INTEGER_POLICY.
 *   - prompt.vars carry { a, b } NOT the product.
 *   - solution === steps[0].expected.
 *   - skillNode is 'multiplication' on task and steps.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - All bands use 'abstract' representationLevel.
 *   - narrowBandParams guard.
 */

import { multiplication } from '../multiplication';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the D8 band shapes from interview-brief.md)
// ---------------------------------------------------------------------------

/** Band 0: abstract, aMax=5, bMax=5 (small tables). */
const BAND0_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 0,
  params: { aMax: 5, bMax: 5 },
};

/** Band 1: abstract, aMax=9, bMax=9 (single-digit tables). */
const BAND1_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 0.5,
  params: { aMax: 9, bMax: 9 },
};

/** Band 2: abstract, aMax=12, bMax=12 (extended tables). */
const BAND2_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 1,
  params: { aMax: 12, bMax: 12 },
};

/** Band 3: abstract, form 'missing-factor', tableMax=12 (division readiness). */
const MISSING_FACTOR_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 1,
  params: { form: 'missing-factor', tableMax: 12 },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('multiplication — byte-reproducibility', () => {
  it('same seed + band0 difficulty → deep-equal GeneratedTask', () => {
    const task1 = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + band1 difficulty → deep-equal GeneratedTask', () => {
    const task1 = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + band2 difficulty → deep-equal GeneratedTask', () => {
    const task1 = multiplication.generate(BAND2_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = multiplication.generate(BAND2_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(1));
    const task2 = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(9999));
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Product invariant: product === factorA * factorB
// ---------------------------------------------------------------------------

describe('multiplication — product === factorA * factorB invariant', () => {
  it('product equals factorA * factorB for band0', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = multiplication.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'abstract',
          params: { aMax: 5, bMax: 5 },
        } as Band,
        createSeededRng(seed)
      ) as { factorA: number; factorB: number; product: number };
      expect(concrete.product).toBe(concrete.factorA * concrete.factorB);
    }
  });

  it('product equals factorA * factorB for band1', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = multiplication.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'abstract',
          params: { aMax: 9, bMax: 9 },
        } as Band,
        createSeededRng(seed)
      ) as { factorA: number; factorB: number; product: number };
      expect(concrete.product).toBe(concrete.factorA * concrete.factorB);
    }
  });

  it('product equals factorA * factorB for band2', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = multiplication.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'abstract',
          params: { aMax: 12, bMax: 12 },
        } as Band,
        createSeededRng(seed)
      ) as { factorA: number; factorB: number; product: number };
      expect(concrete.product).toBe(concrete.factorA * concrete.factorB);
    }
  });

  it('product verified via generate() task solution', () => {
    for (let seed = 0; seed < 20; seed++) {
      const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(seed));
      const vars = task.steps[0].prompt.vars ?? {};
      const a = vars.a as number;
      const b = vars.b as number;
      const expectedProduct = a * b;
      expect(task.steps[0].expected).toBe(canonicalize(expectedProduct));
    }
  });
});

// ---------------------------------------------------------------------------
// Single step emitted
// ---------------------------------------------------------------------------

describe('multiplication — single step emitted', () => {
  it('always emits exactly 1 step for band0', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps).toHaveLength(1);
  });

  it('always emits exactly 1 step for band1', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps).toHaveLength(1);
  });

  it('always emits exactly 1 step for band2', () => {
    const task = multiplication.generate(BAND2_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// InputMode is always 'number' (no CPA variation)
// ---------------------------------------------------------------------------

describe('multiplication — inputMode is always "number"', () => {
  it('band0 uses "number" inputMode', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].inputMode).toBe('number');
  });

  it('band1 uses "number" inputMode', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].inputMode).toBe('number');
  });

  it('band2 uses "number" inputMode', () => {
    const task = multiplication.generate(BAND2_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// All bands use 'abstract' representationLevel (no CPA variation)
// ---------------------------------------------------------------------------

describe('multiplication — all bands use abstract representation', () => {
  it('band0 representation is "abstract"', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.problem.representation).toBe('abstract');
  });

  it('band1 representation is "abstract"', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
  });

  it('band2 representation is "abstract"', () => {
    const task = multiplication.generate(BAND2_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
  });
});

// ---------------------------------------------------------------------------
// expected === canonicalize(product) with SCALAR_INTEGER_POLICY
// ---------------------------------------------------------------------------

describe('multiplication — expected === canonicalize(product)', () => {
  it('step.expected === canonicalize(product) for band0', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(seed));
      const vars = task.steps[0].prompt.vars ?? {};
      const expectedProduct = (vars.a as number) * (vars.b as number);
      expect(task.steps[0].expected).toBe(canonicalize(expectedProduct));
    }
  });

  it('step carries SCALAR_INTEGER_POLICY', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// prompt.vars carry { a, b } NOT the product
// ---------------------------------------------------------------------------

describe('multiplication — prompt.vars carry factors not product', () => {
  it('step.prompt.vars has "a" and "b" keys', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.steps[0].prompt.vars ?? {};
    expect('a' in vars).toBe(true);
    expect('b' in vars).toBe(true);
  });

  it('step.prompt.vars does NOT directly name the product', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.steps[0].prompt.vars ?? {};
    expect('product' in vars).toBe(false);
  });

  it('problem.prompt.vars also carries a and b', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.problem.prompt.vars ?? {};
    expect('a' in vars).toBe(true);
    expect('b' in vars).toBe(true);
  });

  it('vars.a and vars.b are numbers (not strings)', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.steps[0].prompt.vars ?? {};
    expect(typeof vars.a).toBe('number');
    expect(typeof vars.b).toBe('number');
  });

  it('factorA and factorB are within the band range', () => {
    for (let seed = 0; seed < 20; seed++) {
      const task = multiplication.generate(BAND2_DIFFICULTY, createSeededRng(seed));
      const vars = task.steps[0].prompt.vars ?? {};
      const a = vars.a as number;
      const b = vars.b as number;
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(12);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(12);
    }
  });
});

// ---------------------------------------------------------------------------
// solution === steps[0].expected
// ---------------------------------------------------------------------------

describe('multiplication — solution', () => {
  it('solution === steps[0].expected (single-step task)', () => {
    for (const difficulty of [BAND0_DIFFICULTY, BAND1_DIFFICULTY, BAND2_DIFFICULTY]) {
      const task = multiplication.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[0].expected);
    }
  });

  it('solution is a canonical positive integer string', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('multiplication — skillNode', () => {
  it('task.skillNode is "multiplication"', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('multiplication');
  });

  it('step.skillNode is "multiplication"', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('multiplication');
  });

  it('generator.skillNode is "multiplication"', () => {
    expect(multiplication.skillNode).toBe('multiplication');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('multiplication — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with a valid key', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(typeof task.problem.prompt.key).toBe('string');
    expect(task.problem.prompt.key.length).toBeGreaterThan(0);
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('step.prompt.key is "multiplication.step.product"', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('multiplication.step.product');
  });

  it('problem.prompt.key is "multiplication.problem"', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('multiplication.problem');
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('multiplication — elicitFromMastery propagation', () => {
  it('step.elicitFromMastery equals difficulty.elicitFromMastery for band0', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(BAND0_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery equals difficulty.elicitFromMastery for band2', () => {
    const task = multiplication.generate(BAND2_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(BAND2_DIFFICULTY.elicitFromMastery);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('multiplication.instantiate()', () => {
  it('returns an object with factorA, factorB, product', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { aMax: 9, bMax: 9 },
    };
    const result = multiplication.instantiate(band, createSeededRng(FIXED_SEED)) as {
      factorA: number;
      factorB: number;
      product: number;
    };
    expect(typeof result.factorA).toBe('number');
    expect(typeof result.factorB).toBe('number');
    expect(typeof result.product).toBe('number');
    expect(result.product).toBe(result.factorA * result.factorB);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { aMax: 9, bMax: 9 },
    };
    const r1 = multiplication.instantiate(band, createSeededRng(7)) as {
      factorA: number;
      factorB: number;
      product: number;
    };
    const r2 = multiplication.instantiate(band, createSeededRng(7)) as {
      factorA: number;
      factorB: number;
      product: number;
    };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('multiplication — narrowBandParams guard', () => {
  it('throws for missing aMax', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { bMax: 9 }, // missing aMax
    };
    expect(() => multiplication.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[multiplication] Band params have unexpected shape'
    );
  });

  it('throws for missing bMax', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { aMax: 9 }, // missing bMax
    };
    expect(() => multiplication.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[multiplication] Band params have unexpected shape'
    );
  });

  it('throws for null params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: null,
    };
    expect(() => multiplication.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[multiplication] Band params have unexpected shape'
    );
  });

  it("throws for form 'missing-factor' with missing tableMax", () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { form: 'missing-factor' }, // missing tableMax
    };
    expect(() => multiplication.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[multiplication] Band params have unexpected shape'
    );
  });
});

// ---------------------------------------------------------------------------
// 'missing-factor' form — division readiness (a × ▢ = c)
// ---------------------------------------------------------------------------

describe("multiplication — 'missing-factor' form byte-reproducibility", () => {
  it('same seed + missing-factor difficulty → deep-equal GeneratedTask', () => {
    const task1 = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(1));
    const task2 = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(9999));
    expect(task1).not.toEqual(task2);
  });
});

describe("multiplication — 'missing-factor' form balance invariant (a * expected === c)", () => {
  it('a * expected === c (the shown product) for many seeds', () => {
    for (let seed = 0; seed < 30; seed++) {
      const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(seed));
      const vars = task.steps[0].prompt.vars ?? {};
      const a = vars.a as number;
      const c = vars.c as number;
      const expected = parseInt(task.steps[0].expected, 10);
      expect(a * expected).toBe(c);
    }
  });

  it('instantiate(): product === factorA * factorB (the missing factor)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = multiplication.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'abstract',
          params: { form: 'missing-factor', tableMax: 12 },
        } as Band,
        createSeededRng(seed)
      ) as { factorA: number; factorB: number; product: number };
      expect(concrete.product).toBe(concrete.factorA * concrete.factorB);
    }
  });

  it('factorA and the missing factorB are within [1, tableMax]', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = multiplication.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'abstract',
          params: { form: 'missing-factor', tableMax: 12 },
        } as Band,
        createSeededRng(seed)
      ) as { factorA: number; factorB: number };
      expect(concrete.factorA).toBeGreaterThanOrEqual(1);
      expect(concrete.factorA).toBeLessThanOrEqual(12);
      expect(concrete.factorB).toBeGreaterThanOrEqual(1);
      expect(concrete.factorB).toBeLessThanOrEqual(12);
    }
  });
});

describe("multiplication — 'missing-factor' form vars never leak the answer", () => {
  it('step.prompt.vars has "a" and "c" only — never the missing factor', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.steps[0].prompt.vars ?? {};
    expect(Object.keys(vars).sort()).toEqual(['a', 'c']);
    expect('b' in vars).toBe(false);
    expect('factorB' in vars).toBe(false);
    expect('x' in vars).toBe(false);
  });

  it('problem.prompt.vars has "a" and "c" only — never the missing factor', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.problem.prompt.vars ?? {};
    expect(Object.keys(vars).sort()).toEqual(['a', 'c']);
  });

  it('vars.c (the product) never equals the answer for a range of seeds unless coincidental — the answer is not a named var', () => {
    for (let seed = 0; seed < 20; seed++) {
      const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(seed));
      const vars = task.steps[0].prompt.vars ?? {};
      expect(Object.prototype.hasOwnProperty.call(vars, 'b')).toBe(false);
    }
  });
});

describe("multiplication — 'missing-factor' form step shape", () => {
  it('emits exactly 1 step', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps).toHaveLength(1);
  });

  it('inputMode is "number"', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].inputMode).toBe('number');
  });

  it('representation is "abstract"', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
  });

  it('normalizationPolicy is SCALAR_INTEGER_POLICY', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('solution === steps[0].expected', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toBe(task.steps[0].expected);
  });

  it('skillNode is "multiplication" on task and step', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('multiplication');
    expect(task.steps[0].skillNode).toBe('multiplication');
  });

  it('elicitFromMastery propagated from the difficulty envelope', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(MISSING_FACTOR_DIFFICULTY.elicitFromMastery);
  });

  it('problem.prompt.key is "multiplication.problem.missing_factor"', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('multiplication.problem.missing_factor');
  });

  it('step.prompt.key is "multiplication.step.missing_factor"', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('multiplication.step.missing_factor');
  });

  it('prompt key is a valid language-neutral LocalizedRef key', () => {
    const task = multiplication.generate(MISSING_FACTOR_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });
});

// ---------------------------------------------------------------------------
// Old-band regression: 'product' form output is unchanged for a fixed seed
// (pinned snapshot, captured BEFORE the 'missing-factor' form was added, to
// guard against the new form discriminator silently perturbing the rng draw
// order or values for the pre-existing bands).
// ---------------------------------------------------------------------------

describe("multiplication — old-band ('product' form) regression, fixed seed 42", () => {
  it('band0 (aMax=5, bMax=5) is unchanged: a=4, b=3, product=12', () => {
    const task = multiplication.generate(BAND0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.vars).toEqual({ a: 4, b: 3 });
    expect(task.solution).toBe('12');
    expect(task.steps[0].expected).toBe('12');
    expect(task.problem.prompt).toEqual({ key: 'multiplication.problem', vars: { a: 4, b: 3 } });
  });

  it('band1 (aMax=9, bMax=9) is unchanged: a=6, b=5, product=30', () => {
    const task = multiplication.generate(BAND1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.vars).toEqual({ a: 6, b: 5 });
    expect(task.solution).toBe('30');
  });

  it('band2 (aMax=12, bMax=12) is unchanged: a=8, b=6, product=48', () => {
    const task = multiplication.generate(BAND2_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.vars).toEqual({ a: 8, b: 6 });
    expect(task.solution).toBe('48');
  });
});
