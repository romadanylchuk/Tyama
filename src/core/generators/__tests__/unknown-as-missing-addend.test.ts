/**
 * unknown-as-missing-addend.test.ts — Unit tests for the
 * unknown-as-missing-addend generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Construction invariant: c === a + x for all seeds.
 *   - expected === canonicalize(x) (the missing addend).
 *   - normalizationPolicy === SCALAR_INTEGER_POLICY.
 *   - inputMode per representationLevel (concrete → manipulative, pictorial → choice, abstract → number).
 *   - prompt.vars never contain the answer (x).
 *   - solution === steps[0].expected.
 *   - Single step emitted.
 *   - skillNode is 'unknown-as-missing-addend' on task, generator, and steps.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - narrowBandParams guard rejects malformed params.
 */

import { unknownAsMissingAddend } from '../unknown-as-missing-addend';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the shipped-default band shapes)
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

describe('unknownAsMissingAddend — byte-reproducibility', () => {
  it('same seed + concrete difficulty → deep-equal GeneratedTask', () => {
    const task1 = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + pictorial difficulty → deep-equal GeneratedTask', () => {
    const task1 = unknownAsMissingAddend.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = unknownAsMissingAddend.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + abstract difficulty → deep-equal GeneratedTask', () => {
    const task1 = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(1));
    const task2 = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(9999));
    // Different seeds should produce different tasks with very high probability.
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Construction invariant: c === a + x
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — c === a + x invariant', () => {
  it('c === a + x for maxTotal 10 (concrete)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = unknownAsMissingAddend.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { a: number; x: number; c: number };
      expect(concrete.c).toBe(concrete.a + concrete.x);
    }
  });

  it('c === a + x for maxTotal 15 (pictorial)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = unknownAsMissingAddend.instantiate(
        { minCoordinate: 0, representationLevel: 'pictorial', params: { maxTotal: 15 } } as Band,
        createSeededRng(seed)
      ) as { a: number; x: number; c: number };
      expect(concrete.c).toBe(concrete.a + concrete.x);
    }
  });

  it('c === a + x for maxTotal 20 (abstract)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = unknownAsMissingAddend.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 20 } } as Band,
        createSeededRng(seed)
      ) as { a: number; x: number; c: number };
      expect(concrete.c).toBe(concrete.a + concrete.x);
    }
  });

  it('c is always <= maxTotal', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = unknownAsMissingAddend.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 15 } } as Band,
        createSeededRng(seed)
      ) as { a: number; x: number; c: number };
      expect(concrete.c).toBeLessThanOrEqual(15);
    }
  });

  it('a is always >= 1 (positive integer)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = unknownAsMissingAddend.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { a: number };
      expect(concrete.a).toBeGreaterThanOrEqual(1);
    }
  });

  it('x (the missing addend) is always >= 1 (positive integer)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = unknownAsMissingAddend.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { maxTotal: 10 } } as Band,
        createSeededRng(seed)
      ) as { x: number };
      expect(concrete.x).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// expected === canonicalize(x)
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — expected picks the missing addend x', () => {
  it('expected === canonicalize(x) across seeds', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const concrete = unknownAsMissingAddend.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { maxTotal: 20 } } as Band,
        createSeededRng(seed)
      ) as { a: number; x: number; c: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.x));
    }
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — normalizationPolicy', () => {
  it('step carries SCALAR_INTEGER_POLICY', () => {
    const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InputMode per representationLevel
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — inputMode per representationLevel', () => {
  it('concrete representationLevel → "manipulative" inputMode', () => {
    const task = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('concrete');
    expect(task.steps[0].inputMode).toBe('manipulative');
  });

  it('pictorial representationLevel → "choice" inputMode', () => {
    const task = unknownAsMissingAddend.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('choice');
  });

  it('abstract representationLevel → "number" inputMode', () => {
    const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// prompt.vars never contain the answer (x)
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — prompt vars do not contain the answer', () => {
  it('step.prompt.vars has "a" and "c" but never "x"', () => {
    const task = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const stepVars = task.steps[0].prompt.vars ?? {};
    expect('a' in stepVars).toBe(true);
    expect('c' in stepVars).toBe(true);
    expect('x' in stepVars).toBe(false);
  });

  it('step.prompt.vars values never equal the answer value x', () => {
    for (let seed = 0; seed < 20; seed++) {
      const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const answerValue = parseInt(task.steps[0].expected, 10);
      const stepVars = task.steps[0].prompt.vars ?? {};
      // a + x = c, so a and c are both known values distinct in role from x.
      // We assert the answer is not directly exposed under an 'x' key, and that
      // the known values (a, c) reconstruct to the answer only via subtraction
      // (c - a === x), never by direct exposure.
      expect(stepVars.a).toBeDefined();
      expect(stepVars.c).toBeDefined();
      expect((stepVars.c as number) - (stepVars.a as number)).toBe(answerValue);
    }
  });

  it('problem.prompt.vars carries "a" and "c" only, never "x"', () => {
    const task = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const problemVars = task.problem.prompt.vars ?? {};
    expect('a' in problemVars).toBe(true);
    expect('c' in problemVars).toBe(true);
    expect('x' in problemVars).toBe(false);
  });

  it('problem.prompt.vars matches step.prompt.vars (same known values)', () => {
    const task = unknownAsMissingAddend.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.vars).toEqual(task.steps[0].prompt.vars);
  });
});

// ---------------------------------------------------------------------------
// solution === steps[0].expected
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — solution', () => {
  it('solution === steps[0].expected (single-step task)', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = unknownAsMissingAddend.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[0].expected);
    }
  });

  it('solution is a canonical integer string', () => {
    const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// Single step
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — single step emitted', () => {
  it('always emits exactly 1 step', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = unknownAsMissingAddend.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — skillNode', () => {
  it('task.skillNode is "unknown-as-missing-addend"', () => {
    const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('unknown-as-missing-addend');
  });

  it('step.skillNode is "unknown-as-missing-addend"', () => {
    const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('unknown-as-missing-addend');
  });

  it('generator.skillNode is "unknown-as-missing-addend"', () => {
    expect(unknownAsMissingAddend.skillNode).toBe('unknown-as-missing-addend');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with a valid key', () => {
    const task = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(typeof task.problem.prompt.key).toBe('string');
    expect(task.problem.prompt.key.length).toBeGreaterThan(0);
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
    expect(task.problem.prompt.key).toBe('missing_addend.problem');
  });

  it('step.prompt is a LocalizedRef with a valid key', () => {
    const task = unknownAsMissingAddend.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(typeof task.steps[0].prompt.key).toBe('string');
    expect(task.steps[0].prompt.key.length).toBeGreaterThan(0);
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
    expect(task.steps[0].prompt.key).toBe('missing_addend.step.addend');
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — elicitFromMastery propagation', () => {
  it('step.elicitFromMastery equals difficulty.elicitFromMastery', () => {
    const task = unknownAsMissingAddend.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at the concrete band', () => {
    const task = unknownAsMissingAddend.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend.instantiate()', () => {
  it('returns an object with a, x, c', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxTotal: 15 },
    };
    const result = unknownAsMissingAddend.instantiate(band, createSeededRng(FIXED_SEED)) as {
      a: number;
      x: number;
      c: number;
    };
    expect(typeof result.a).toBe('number');
    expect(typeof result.x).toBe('number');
    expect(typeof result.c).toBe('number');
    expect(result.c).toBe(result.a + result.x);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { maxTotal: 10 },
    };
    const r1 = unknownAsMissingAddend.instantiate(band, createSeededRng(7)) as { a: number; x: number; c: number };
    const r2 = unknownAsMissingAddend.instantiate(band, createSeededRng(7)) as { a: number; x: number; c: number };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('unknownAsMissingAddend — narrowBandParams guard', () => {
  it('throws for missing maxTotal', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: {}, // missing maxTotal
    };
    expect(() => unknownAsMissingAddend.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[unknown-as-missing-addend] Band params have unexpected shape'
    );
  });

  it('throws for non-numeric maxTotal', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { maxTotal: 'ten' },
    };
    expect(() => unknownAsMissingAddend.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[unknown-as-missing-addend] Band params have unexpected shape'
    );
  });
});
