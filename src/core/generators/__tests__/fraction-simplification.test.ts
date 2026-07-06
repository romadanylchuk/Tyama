/**
 * fraction-simplification.test.ts — Unit tests for the fraction-simplification generator.
 *
 * Coverage:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Reduction invariant: gcd(p, q) === 1 (rejection sampling works).
 *   - Presented fraction is genuinely non-reduced: gcd(presentedNum, presentedDen) > 1.
 *   - presentedNum / presentedDen === p / q (mathematically equivalent).
 *   - Two steps emitted, in order: numerator (p), then denominator (q).
 *   - steps[0].expected === canonicalize(p), steps[1].expected === canonicalize(q).
 *   - Both steps carry SCALAR_INTEGER_POLICY (integer path, not fraction branch).
 *   - inputMode per representationLevel:
 *       concrete  → 'manipulative' (both steps)
 *       pictorial → 'multi-slot'   (both steps)
 *       abstract  → 'multi-slot'   (both steps)
 *   - task.solution === canonicalizeFraction(p, q) (PROVES D1).
 *   - PROVES D1 assertions:
 *       canonicalizeFraction(p, q) === `${p}/${q}` for coprime pair, q >= 2.
 *       canonicalizeFraction(p*k, q*k) === task.solution (fold of unreduced fraction).
 *   - q >= 2 (result is always a true fraction, never collapses to integer).
 *   - p >= 1 && p < q (proper fraction).
 *   - k >= 2 (task is genuinely non-reduced).
 *   - skillNode is 'fraction-simplification' on task, steps, and generator.
 *   - Language-neutral LocalizedRef keys (lowercase, dot-separated).
 *   - problem.prompt.vars carry presentedNum and presentedDen (not p or q).
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - instantiate is reproducible with the same seed.
 *   - narrowBandParams guard rejects bad shapes.
 */

import { fractionSimplification } from '../fraction-simplification';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, canonicalizeFraction, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// GCD helper (test-local — mirrors the generator's internal gcd for assertions)
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const tmp = y;
    y = x % y;
    x = tmp;
  }
  return x;
}

// ---------------------------------------------------------------------------
// Fixture difficulty params (per the Phase 6 plan CPA ladder)
// ---------------------------------------------------------------------------

/** Band 0: concrete, manipulative inputMode — { maxDenominator: 4, maxFactor: 2 } */
const CONCRETE_DIFFICULTY: DifficultyParams = {
  representationLevel: 'concrete',
  elicitFromMastery: 0,
  params: { maxDenominator: 4, maxFactor: 2 },
};

/** Band 1: pictorial, multi-slot inputMode — { maxDenominator: 8, maxFactor: 3 } */
const PICTORIAL_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0.5,
  params: { maxDenominator: 8, maxFactor: 3 },
};

/** Band 2: abstract, multi-slot inputMode — { maxDenominator: 12, maxFactor: 4 } */
const ABSTRACT_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 1,
  params: { maxDenominator: 12, maxFactor: 4 },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('fractionSimplification — byte-reproducibility', () => {
  it('same seed + concrete difficulty → deep-equal GeneratedTask', () => {
    const task1 = fractionSimplification.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = fractionSimplification.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + pictorial difficulty → deep-equal GeneratedTask', () => {
    const task1 = fractionSimplification.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = fractionSimplification.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + abstract difficulty → deep-equal GeneratedTask', () => {
    const task1 = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(1));
    const task2 = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(9999));
    // Different seeds should produce different tasks with very high probability.
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Reduction invariant: gcd(p, q) === 1 (rejection sampling works)
// ---------------------------------------------------------------------------

describe('fractionSimplification — coprime base pair (rejection sampling)', () => {
  it('gcd(p, q) === 1 for all generated tasks (concrete)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxDenominator: 4, maxFactor: 2 } } as Band,
        createSeededRng(seed)
      ) as { p: number; q: number };
      expect(gcd(concrete.p, concrete.q)).toBe(1);
    }
  });

  it('gcd(p, q) === 1 for all generated tasks (abstract, large range)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } } as Band,
        createSeededRng(seed)
      ) as { p: number; q: number };
      expect(gcd(concrete.p, concrete.q)).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// q >= 2 (result is always a true fraction, never collapses to integer)
// ---------------------------------------------------------------------------

describe('fractionSimplification — q >= 2 invariant', () => {
  it('q >= 2 for all generated tasks (concrete)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxDenominator: 4, maxFactor: 2 } } as Band,
        createSeededRng(seed)
      ) as { q: number };
      expect(concrete.q).toBeGreaterThanOrEqual(2);
    }
  });

  it('q >= 2 for all generated tasks (abstract)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } } as Band,
        createSeededRng(seed)
      ) as { q: number };
      expect(concrete.q).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// p >= 1 && p < q (proper fraction)
// ---------------------------------------------------------------------------

describe('fractionSimplification — proper fraction (p >= 1, p < q)', () => {
  it('p >= 1 for all generated tasks', () => {
    for (let seed = 0; seed < 25; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } } as Band,
        createSeededRng(seed)
      ) as { p: number; q: number };
      expect(concrete.p).toBeGreaterThanOrEqual(1);
    }
  });

  it('p < q for all generated tasks (proper fraction)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } } as Band,
        createSeededRng(seed)
      ) as { p: number; q: number };
      expect(concrete.p).toBeLessThan(concrete.q);
    }
  });
});

// ---------------------------------------------------------------------------
// k >= 2 (presented fraction is genuinely non-reduced)
// ---------------------------------------------------------------------------

describe('fractionSimplification — k >= 2 (task is genuinely non-reduced)', () => {
  it('k >= 2 for all generated tasks', () => {
    for (let seed = 0; seed < 25; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } } as Band,
        createSeededRng(seed)
      ) as { k: number };
      expect(concrete.k).toBeGreaterThanOrEqual(2);
    }
  });

  it('presentedNum and presentedDen share a common factor (gcd > 1)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } } as Band,
        createSeededRng(seed)
      ) as { presentedNum: number; presentedDen: number; k: number };
      // gcd(p*k, q*k) = k * gcd(p, q) = k * 1 = k >= 2
      expect(gcd(concrete.presentedNum, concrete.presentedDen)).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Presented fraction reduces to p/q
// ---------------------------------------------------------------------------

describe('fractionSimplification — presentedNum/presentedDen === p/q', () => {
  it('presented fraction reduces to the target reduced fraction', () => {
    for (let seed = 0; seed < 25; seed++) {
      const concrete = fractionSimplification.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } } as Band,
        createSeededRng(seed)
      ) as { p: number; q: number; k: number; presentedNum: number; presentedDen: number };
      // presentedNum = p * k, presentedDen = q * k
      expect(concrete.presentedNum).toBe(concrete.p * concrete.k);
      expect(concrete.presentedDen).toBe(concrete.q * concrete.k);
      // Ratios are equal (cross multiply to avoid float division)
      expect(concrete.presentedNum * concrete.q).toBe(concrete.p * concrete.presentedDen);
    }
  });
});

// ---------------------------------------------------------------------------
// Two steps: expected values
// ---------------------------------------------------------------------------

describe('fractionSimplification — two steps with correct expected values', () => {
  it('emits exactly 2 steps', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = fractionSimplification.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(2);
    }
  });

  it('steps[0].expected === canonicalize(p)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } };
      const concrete = fractionSimplification.instantiate(band, createSeededRng(seed)) as { p: number; q: number };
      const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      expect(task.steps[0].expected).toBe(canonicalize(concrete.p));
    }
  });

  it('steps[1].expected === canonicalize(q)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } };
      const concrete = fractionSimplification.instantiate(band, createSeededRng(seed)) as { p: number; q: number };
      const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      expect(task.steps[1].expected).toBe(canonicalize(concrete.q));
    }
  });

  it('steps[0].expected is a valid integer string', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].expected).toMatch(/^[1-9][0-9]*$/);
  });

  it('steps[1].expected is a valid integer string >= 2', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(parseInt(task.steps[1].expected, 10)).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// SCALAR_INTEGER_POLICY on both steps
// ---------------------------------------------------------------------------

describe('fractionSimplification — SCALAR_INTEGER_POLICY on both steps', () => {
  it('steps[0].normalizationPolicy === SCALAR_INTEGER_POLICY', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('steps[1].normalizationPolicy === SCALAR_INTEGER_POLICY', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[1].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer" on both steps', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
    expect(task.steps[1].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false on both steps (integer checking path)', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
    expect(task.steps[1].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inputMode per representationLevel
// ---------------------------------------------------------------------------

describe('fractionSimplification — inputMode per representationLevel', () => {
  it('concrete representationLevel → "manipulative" inputMode on both steps', () => {
    const task = fractionSimplification.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('concrete');
    expect(task.steps[0].inputMode).toBe('manipulative');
    expect(task.steps[1].inputMode).toBe('manipulative');
  });

  it('pictorial representationLevel → "multi-slot" inputMode on both steps', () => {
    const task = fractionSimplification.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('multi-slot');
    expect(task.steps[1].inputMode).toBe('multi-slot');
  });

  it('abstract representationLevel → "multi-slot" inputMode on both steps', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('multi-slot');
    expect(task.steps[1].inputMode).toBe('multi-slot');
  });
});

// ---------------------------------------------------------------------------
// task.solution === canonicalizeFraction(p, q) — PROVES D1
// ---------------------------------------------------------------------------

describe('fractionSimplification — task.solution PROVES D1 (canonicalizeFraction spine)', () => {
  it('task.solution === canonicalizeFraction(p, q) for all seeds', () => {
    for (let seed = 0; seed < 20; seed++) {
      const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } };
      const concrete = fractionSimplification.instantiate(band, createSeededRng(seed)) as { p: number; q: number; k: number };
      const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      expect(task.solution).toBe(canonicalizeFraction(concrete.p, concrete.q));
    }
  });

  it('PROVES D1: canonicalizeFraction(p, q) === `${p}/${q}` for coprime pair with q >= 2', () => {
    // Since gcd(p, q) === 1 and q >= 2, canonicalizeFraction should return exactly `${p}/${q}`.
    // This assertion would fail loudly if canonicalizeFraction diverged from the spec.
    for (let seed = 0; seed < 30; seed++) {
      const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } };
      const concrete = fractionSimplification.instantiate(band, createSeededRng(seed)) as { p: number; q: number };
      const expected = `${concrete.p}/${concrete.q}`;
      expect(canonicalizeFraction(concrete.p, concrete.q)).toBe(expected);
    }
  });

  it('PROVES D1: canonicalizeFraction(p*k, q*k) === task.solution (fold of unreduced fraction)', () => {
    // Folding the PRESENTED (unreduced) fraction through canonicalizeFraction yields
    // the same canonical string as task.solution. If D1 diverged, this fails loudly.
    for (let seed = 0; seed < 30; seed++) {
      const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } };
      const concrete = fractionSimplification.instantiate(band, createSeededRng(seed)) as {
        p: number;
        q: number;
        k: number;
        presentedNum: number;
        presentedDen: number;
      };
      const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      expect(canonicalizeFraction(concrete.presentedNum, concrete.presentedDen)).toBe(task.solution);
    }
  });

  it('task.solution is always a "p/q" string (never an integer — because q >= 2)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      // Solution must contain a '/' — never collapses to integer because q >= 2.
      expect(task.solution).toContain('/');
      // Format: "p/q" where p >= 1 and q >= 2 (multi-digit denominators like 10, 12 are valid).
      expect(task.solution).toMatch(/^[1-9][0-9]*\/[1-9][0-9]*$/);
      // Additionally verify the denominator part (after '/') is >= 2.
      const parts = task.solution.split('/');
      expect(parseInt(parts[1], 10)).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('fractionSimplification — skillNode', () => {
  it('task.skillNode is "fraction-simplification"', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('fraction-simplification');
  });

  it('steps[0].skillNode is "fraction-simplification"', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('fraction-simplification');
  });

  it('steps[1].skillNode is "fraction-simplification"', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[1].skillNode).toBe('fraction-simplification');
  });

  it('generator.skillNode is "fraction-simplification"', () => {
    expect(fractionSimplification.skillNode).toBe('fraction-simplification');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('fractionSimplification — language-neutral LocalizedRef', () => {
  it('problem.prompt.key is a valid lowercase key', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
    expect(task.problem.prompt.key).toContain('fraction_simpl.problem');
  });

  it('steps[0].prompt.key encodes "numerator" as a lowercase segment', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
    expect(task.steps[0].prompt.key).toContain('numerator');
  });

  it('steps[1].prompt.key encodes "denominator" as a lowercase segment', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[1].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
    expect(task.steps[1].prompt.key).toContain('denominator');
  });
});

// ---------------------------------------------------------------------------
// problem.prompt.vars carry presentedNum and presentedDen (NOT p or q directly)
// ---------------------------------------------------------------------------

describe('fractionSimplification — problem.prompt.vars carry presented fraction', () => {
  it('problem.prompt.vars has num and den (the PRESENTED unreduced fraction)', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const vars = task.problem.prompt.vars ?? {};
    // The problem presents the unreduced fraction
    expect('num' in vars).toBe(true);
    expect('den' in vars).toBe(true);
  });

  it('problem.prompt.vars.num and .den match the presented (unreduced) fraction', () => {
    for (let seed = 0; seed < 10; seed++) {
      const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxDenominator: 12, maxFactor: 4 } };
      const concrete = fractionSimplification.instantiate(band, createSeededRng(seed)) as {
        presentedNum: number;
        presentedDen: number;
      };
      const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const vars = task.problem.prompt.vars ?? {};
      expect(vars['num']).toBe(concrete.presentedNum);
      expect(vars['den']).toBe(concrete.presentedDen);
    }
  });

  it('step.prompt.vars carry the presented fraction (not p or q individually as "answer")', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    // Steps carry the presented fraction context (num, den) — not a directly named answer field
    const stepVars = task.steps[0].prompt.vars ?? {};
    expect('num' in stepVars).toBe(true);
    expect('den' in stepVars).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('fractionSimplification — elicitFromMastery propagation', () => {
  it('both steps carry elicitFromMastery from difficulty envelope', () => {
    const task = fractionSimplification.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
    expect(task.steps[1].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
  });

  it('elicitFromMastery is 0 at the concrete band for both steps', () => {
    const task = fractionSimplification.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
    expect(task.steps[1].elicitFromMastery).toBe(0);
  });

  it('elicitFromMastery is 0.5 at the pictorial band', () => {
    const task = fractionSimplification.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0.5);
    expect(task.steps[1].elicitFromMastery).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('fractionSimplification.instantiate()', () => {
  it('returns an object with p, q, k, presentedNum, presentedDen, representationLevel', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxDenominator: 12, maxFactor: 4 },
    };
    const result = fractionSimplification.instantiate(band, createSeededRng(FIXED_SEED)) as {
      p: number;
      q: number;
      k: number;
      presentedNum: number;
      presentedDen: number;
      representationLevel: string;
    };
    expect(typeof result.p).toBe('number');
    expect(typeof result.q).toBe('number');
    expect(typeof result.k).toBe('number');
    expect(typeof result.presentedNum).toBe('number');
    expect(typeof result.presentedDen).toBe('number');
    expect(result.representationLevel).toBe('abstract');
    // Check invariants
    expect(result.presentedNum).toBe(result.p * result.k);
    expect(result.presentedDen).toBe(result.q * result.k);
    expect(result.q).toBeGreaterThanOrEqual(2);
    expect(result.k).toBeGreaterThanOrEqual(2);
    expect(gcd(result.p, result.q)).toBe(1);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxDenominator: 8, maxFactor: 3 },
    };
    const r1 = fractionSimplification.instantiate(band, createSeededRng(7)) as { p: number; q: number; k: number };
    const r2 = fractionSimplification.instantiate(band, createSeededRng(7)) as { p: number; q: number; k: number };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('fractionSimplification — narrowBandParams guard', () => {
  it('throws for missing maxDenominator', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { maxFactor: 3 }, // missing maxDenominator
    };
    expect(() => fractionSimplification.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[fraction-simplification] Band params have unexpected shape'
    );
  });

  it('throws for missing maxFactor', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { maxDenominator: 8 }, // missing maxFactor
    };
    expect(() => fractionSimplification.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[fraction-simplification] Band params have unexpected shape'
    );
  });

  it('throws for null params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: null,
    };
    expect(() => fractionSimplification.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[fraction-simplification] Band params have unexpected shape'
    );
  });

  it('throws for non-number maxDenominator', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { maxDenominator: '8', maxFactor: 3 }, // string, not number
    };
    expect(() => fractionSimplification.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[fraction-simplification] Band params have unexpected shape'
    );
  });
});

// ---------------------------------------------------------------------------
// Multi-seed stress test: all invariants hold simultaneously
// ---------------------------------------------------------------------------

describe('fractionSimplification — multi-seed stress test', () => {
  it('all invariants hold for 50 seeds across all bands', () => {
    const difficulties = [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY];
    for (const difficulty of difficulties) {
      for (let seed = 0; seed < 50; seed++) {
        const task = fractionSimplification.generate(difficulty, createSeededRng(seed));
        const band: Band = { minCoordinate: 0, representationLevel: difficulty.representationLevel, params: difficulty.params };
        const concrete = fractionSimplification.instantiate(band, createSeededRng(seed)) as {
          p: number;
          q: number;
          k: number;
          presentedNum: number;
          presentedDen: number;
        };

        // Structural invariants
        expect(task.steps).toHaveLength(2);
        expect(task.skillNode).toBe('fraction-simplification');

        // Coprime check
        expect(gcd(concrete.p, concrete.q)).toBe(1);

        // q >= 2 (never integer collapse)
        expect(concrete.q).toBeGreaterThanOrEqual(2);

        // Proper fraction
        expect(concrete.p).toBeGreaterThanOrEqual(1);
        expect(concrete.p).toBeLessThan(concrete.q);

        // k >= 2 (genuinely non-reduced)
        expect(concrete.k).toBeGreaterThanOrEqual(2);

        // Presented = p*k / q*k
        expect(concrete.presentedNum).toBe(concrete.p * concrete.k);
        expect(concrete.presentedDen).toBe(concrete.q * concrete.k);

        // Steps carry correct expected values
        expect(task.steps[0].expected).toBe(canonicalize(concrete.p));
        expect(task.steps[1].expected).toBe(canonicalize(concrete.q));

        // Both steps use SCALAR_INTEGER_POLICY
        expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
        expect(task.steps[1].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);

        // D1 proof
        expect(task.solution).toBe(canonicalizeFraction(concrete.p, concrete.q));
        expect(canonicalizeFraction(concrete.presentedNum, concrete.presentedDen)).toBe(task.solution);
        // Solution always contains '/' because q >= 2 (never collapses to integer)
        expect(task.solution).toContain('/');
      }
    }
  });
});
