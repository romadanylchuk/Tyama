/**
 * fruit-equations.test.ts — Unit tests for the fruit-equations generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + same difficulty → deep-equal GeneratedTask.
 *   - Every step.expected equals canonicalize(quantity) (canonical form).
 *   - Every step carries SCALAR_DECIMAL_POLICY.
 *   - solution is canonical.
 *   - Backward construction: the equation balances (sum of unknowns == total).
 *   - problem.prompt and step.prompt are LocalizedRef (no raw localized strings).
 *   - skillNode on task and steps is 'fruit-equations'.
 *   - inputMode is 'tokens' for pictorial, 'number' for abstract.
 *   - Multi-unknown (unknowns=2) produces 2 steps.
 *   - Single-unknown (unknowns=1) produces 1 step.
 *   - Negatives band: expected values are canonical (sign is canonical).
 */

import { fruitEquations } from '../fruit-equations';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_DECIMAL_POLICY } from '../../canonical';
import type { DifficultyParams } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the graph-fixture band shapes)
// ---------------------------------------------------------------------------

/** Easy band (1 unknown, range 5, pictorial, no negatives). */
const EASY_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0,
  params: { unknowns: 1, range: 5, negatives: false },
};

/** Medium band (2 unknowns, range 10, pictorial, no negatives). */
const MEDIUM_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0.5,
  params: { unknowns: 2, range: 10, negatives: false },
};

/** Hard band (2 unknowns, range 20, abstract, negatives allowed). */
const HARD_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 1,
  params: { unknowns: 2, range: 20, negatives: true },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('fruitEquations — byte-reproducibility', () => {
  it('same seed + same difficulty → deep-equal GeneratedTask (easy)', () => {
    const task1 = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + same difficulty → deep-equal GeneratedTask (medium)', () => {
    const task1 = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + same difficulty → deep-equal GeneratedTask (hard)', () => {
    const task1 = fruitEquations.generate(HARD_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = fruitEquations.generate(HARD_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (with high probability)', () => {
    const task1 = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(1));
    const task2 = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(9999));
    // Different seeds should produce different steps (this may occasionally collide
    // for range=10, but with two unknowns the probability is < 1%).
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Step.expected canonical form
// ---------------------------------------------------------------------------

describe('fruitEquations — canonical step.expected', () => {
  it('every step.expected equals canonicalize of an integer (easy)', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    for (const step of task.steps) {
      const value = parseInt(step.expected, 10);
      expect(isNaN(value)).toBe(false);
      expect(step.expected).toBe(canonicalize(value));
    }
  });

  it('every step.expected is a canonical string (not empty)', () => {
    const task = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    for (const step of task.steps) {
      expect(typeof step.expected).toBe('string');
      expect(step.expected.length).toBeGreaterThan(0);
    }
  });

  it('step.expected for hard band may be negative (canonical form)', () => {
    // Run many seeds to find a negative — negatives:true band allows them.
    let foundNegative = false;
    for (let seed = 0; seed < 100; seed++) {
      const task = fruitEquations.generate(HARD_DIFFICULTY, createSeededRng(seed));
      for (const step of task.steps) {
        if (step.expected.startsWith('-')) {
          foundNegative = true;
          // Canonical form: '-3', not '-3.0', not '- 3'.
          expect(step.expected).toMatch(/^-[1-9][0-9]*$/);
        }
      }
    }
    expect(foundNegative).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('fruitEquations — normalizationPolicy on steps', () => {
  it('every step carries SCALAR_DECIMAL_POLICY', () => {
    const task = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    for (const step of task.steps) {
      expect(step.normalizationPolicy).toEqual(SCALAR_DECIMAL_POLICY);
    }
  });

  it('normalizationPolicy.decimalForm is "standard"', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    for (const step of task.steps) {
      expect(step.normalizationPolicy.decimalForm).toBe('standard');
    }
  });

  it('normalizationPolicy.lowestTerms is false (no fraction steps)', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    for (const step of task.steps) {
      expect(step.normalizationPolicy.lowestTerms).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// solution
// ---------------------------------------------------------------------------

describe('fruitEquations — solution field', () => {
  it('solution is a canonical string (easy: 1 unknown → solution == steps[0].expected)', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(typeof task.solution).toBe('string');
    expect(task.solution.length).toBeGreaterThan(0);
    // For 1 unknown, solution is the canonical total (which equals the single step value).
    expect(task.solution).toBe(task.steps[0].expected);
  });

  it('solution equals canonicalize of the total (2 unknowns)', () => {
    const task = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    // solution is the canonical total; steps are the individual unknowns.
    const stepValues = task.steps.map((s) => parseInt(s.expected, 10));
    const total = stepValues.reduce((a, b) => a + b, 0);
    expect(task.solution).toBe(canonicalize(total));
  });
});

// ---------------------------------------------------------------------------
// Backward construction sanity (equation balances)
// ---------------------------------------------------------------------------

describe('fruitEquations — backward construction correctness', () => {
  it('for 1 unknown: solution equals the single step answer (🍎)', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps).toHaveLength(1);
    const stepVal = parseInt(task.steps[0].expected, 10);
    const solutionVal = parseInt(task.solution, 10);
    expect(stepVal).toBe(solutionVal); // solution === 🍎 for a one-fruit task
  });

  it('for 2 unknowns: sum of step values equals the canonical solution total', () => {
    for (let seed = 0; seed < 20; seed++) {
      const task = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(seed));
      expect(task.steps).toHaveLength(2);
      const sumOfSteps = task.steps.reduce((sum, s) => sum + parseInt(s.expected, 10), 0);
      expect(task.solution).toBe(canonicalize(sumOfSteps));
    }
  });

  it('backward construction holds for hard band (negatives)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const task = fruitEquations.generate(HARD_DIFFICULTY, createSeededRng(seed));
      const sumOfSteps = task.steps.reduce((sum, s) => sum + parseInt(s.expected, 10), 0);
      expect(task.solution).toBe(canonicalize(sumOfSteps));
    }
  });
});

// ---------------------------------------------------------------------------
// Language-neutral: LocalizedRef fields
// ---------------------------------------------------------------------------

describe('fruitEquations — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with a key (no raw localized string)', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(typeof task.problem.prompt.key).toBe('string');
    expect(task.problem.prompt.key.length).toBeGreaterThan(0);
    // Must not be a human-readable sentence (it is a resource key).
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('problem.prompt.vars carry the equation numbers (coeff/totals, not display strings)', () => {
    // 1 unknown: { coeff, total } — renders "coeff × 🍎 = total".
    const easy = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(easy.problem.prompt.vars).toBeDefined();
    expect(typeof easy.problem.prompt.vars!.coeff).toBe('number');
    expect(typeof easy.problem.prompt.vars!.total).toBe('number');

    // 2 unknowns: { coeffA, total1, total2 } — renders both equations.
    const medium = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(typeof medium.problem.prompt.vars!.coeffA).toBe('number');
    expect(typeof medium.problem.prompt.vars!.total1).toBe('number');
    expect(typeof medium.problem.prompt.vars!.total2).toBe('number');
  });

  it('each step.prompt is a LocalizedRef with a key', () => {
    const task = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    for (const step of task.steps) {
      expect(typeof step.prompt.key).toBe('string');
      expect(step.prompt.key.length).toBeGreaterThan(0);
      expect(step.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('fruitEquations — skillNode', () => {
  it('task.skillNode is "fruit-equations"', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('fruit-equations');
  });

  it('every step.skillNode is "fruit-equations"', () => {
    const task = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    for (const step of task.steps) {
      expect(step.skillNode).toBe('fruit-equations');
    }
  });

  it('generator.skillNode is "fruit-equations"', () => {
    expect(fruitEquations.skillNode).toBe('fruit-equations');
  });
});

// ---------------------------------------------------------------------------
// InputMode
// ---------------------------------------------------------------------------

describe('fruitEquations — inputMode', () => {
  it('uses "tokens" inputMode for pictorial representation', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    for (const step of task.steps) {
      expect(step.inputMode).toBe('tokens');
    }
  });

  it('uses "number" inputMode for abstract representation', () => {
    const task = fruitEquations.generate(HARD_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    for (const step of task.steps) {
      expect(step.inputMode).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Step counts (unknowns parameter)
// ---------------------------------------------------------------------------

describe('fruitEquations — step count per unknowns', () => {
  it('unknowns=1 produces exactly 1 step', () => {
    const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps).toHaveLength(1);
  });

  it('unknowns=2 produces exactly 2 steps', () => {
    const task = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// representation field
// ---------------------------------------------------------------------------

describe('fruitEquations — representation', () => {
  it('task.representation matches difficulty.representationLevel', () => {
    const easyTask = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(easyTask.representation).toBe('pictorial');

    const hardTask = fruitEquations.generate(HARD_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(hardTask.representation).toBe('abstract');
  });
});

// ---------------------------------------------------------------------------
// instantiate (exposed for testing per Generator contract)
// ---------------------------------------------------------------------------

interface Concrete {
  unknowns: 1 | 2;
  apple: number;
  coeffA: number;
  total1: number;
  banana?: number;
  total2?: number;
}

describe('fruitEquations.instantiate()', () => {
  it('produces a solvable coefficient equation (coeffA × apple = total1, coeffA ≥ 2)', () => {
    const band = {
      minCoordinate: 0,
      representationLevel: 'pictorial' as const,
      params: { unknowns: 1, range: 5, negatives: false },
    };
    const r = fruitEquations.instantiate(band, createSeededRng(FIXED_SEED)) as Concrete;
    expect(r.unknowns).toBe(1);
    expect(r.coeffA).toBeGreaterThanOrEqual(2);
    // Equation 1 balances → apple is uniquely recoverable as total1 / coeffA.
    expect(r.total1).toBe(r.coeffA * r.apple);
    expect(r.banana).toBeUndefined();
  });

  it('produces a solvable 2-equation system (coeffA × apple = total1; apple + banana = total2)', () => {
    const band = {
      minCoordinate: 0,
      representationLevel: 'pictorial' as const,
      params: { unknowns: 2, range: 10, negatives: false },
    };
    const r = fruitEquations.instantiate(band, createSeededRng(FIXED_SEED)) as Concrete;
    expect(r.unknowns).toBe(2);
    expect(r.coeffA).toBeGreaterThanOrEqual(2);
    // Both equations balance → apple, then banana, are uniquely deducible.
    expect(r.total1).toBe(r.coeffA * r.apple);
    expect(r.total2).toBe(r.apple + (r.banana as number));
  });

  it('instantiate is reproducible with the same seed', () => {
    const band = {
      minCoordinate: 0,
      representationLevel: 'abstract' as const,
      params: { unknowns: 2, range: 5, negatives: false },
    };
    const r1 = fruitEquations.instantiate(band, createSeededRng(7)) as Concrete;
    const r2 = fruitEquations.instantiate(band, createSeededRng(7)) as Concrete;
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// Puzzle is genuinely solvable (regression: the old generator was degenerate —
// 1-unknown was trivial "apple = total", 2-unknown was underdetermined).
// ---------------------------------------------------------------------------

describe('fruitEquations — puzzle is uniquely solvable', () => {
  it('one unknown: apple is recoverable by division and is NOT just the total', () => {
    let sawNonTrivial = false;
    for (let seed = 0; seed < 30; seed++) {
      const task = fruitEquations.generate(EASY_DIFFICULTY, createSeededRng(seed));
      const coeff = task.problem.prompt.vars!.coeff as number;
      const total = task.problem.prompt.vars!.total as number;
      const apple = parseInt(task.steps[0].expected, 10);
      // The stated equation holds and the answer is total / coeff (real division).
      expect(total).toBe(coeff * apple);
      if (apple !== total) sawNonTrivial = true;
    }
    // coeff ≥ 2 guarantees apple !== total whenever apple !== 0.
    expect(sawNonTrivial).toBe(true);
  });

  it('two unknowns: both equations pin the answers exactly', () => {
    for (let seed = 0; seed < 30; seed++) {
      const task = fruitEquations.generate(MEDIUM_DIFFICULTY, createSeededRng(seed));
      const coeffA = task.problem.prompt.vars!.coeffA as number;
      const total1 = task.problem.prompt.vars!.total1 as number;
      const total2 = task.problem.prompt.vars!.total2 as number;
      const apple = parseInt(task.steps[0].expected, 10);
      const banana = parseInt(task.steps[1].expected, 10);
      expect(total1).toBe(coeffA * apple); // equation 1 → apple
      expect(total2).toBe(apple + banana); // equation 2 → banana
    }
  });
});
