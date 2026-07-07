/**
 * division.test.ts — Unit tests for the division generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Backward-construction invariant: a * q === c for all seeds.
 *   - expected === canonicalize(q).
 *   - normalizationPolicy === SCALAR_INTEGER_POLICY.
 *   - inputMode is always 'number' (flat abstract).
 *   - prompt.vars never contain the quotient (the answer).
 *   - solution === steps[0].expected.
 *   - Single step emitted.
 *   - skillNode is 'division' on task, steps, and generator.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 *   - narrowBandParams guard rejects malformed band params.
 */

import { division } from '../division';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the suggested band defaults)
// ---------------------------------------------------------------------------

/** Band 0: abstract, tableMax 5. */
const BAND_0_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 0,
  params: { tableMax: 5 },
};

/** Band 1: abstract, tableMax 10. */
const BAND_1_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 0.5,
  params: { tableMax: 10 },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('division — byte-reproducibility', () => {
  it('same seed + band-0 difficulty → deep-equal GeneratedTask', () => {
    const task1 = division.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = division.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + band-1 difficulty → deep-equal GeneratedTask', () => {
    const task1 = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = division.generate(BAND_1_DIFFICULTY, createSeededRng(1));
    const task2 = division.generate(BAND_1_DIFFICULTY, createSeededRng(9999));
    // Different seeds should produce different tasks with very high probability.
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Backward-construction invariant: a * q === c
// ---------------------------------------------------------------------------

describe('division — a * q === c invariant', () => {
  it('a * q === c for band 0', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = division.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { tableMax: 5 } } as Band,
        createSeededRng(seed)
      ) as { a: number; c: number; q: number };
      expect(concrete.c).toBe(concrete.a * concrete.q);
    }
  });

  it('a * q === c for band 1', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = division.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { tableMax: 10 } } as Band,
        createSeededRng(seed)
      ) as { a: number; c: number; q: number };
      expect(concrete.c).toBe(concrete.a * concrete.q);
    }
  });

  it('q is always within [2, tableMax]', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = division.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { tableMax: 10 } } as Band,
        createSeededRng(seed)
      ) as { q: number };
      expect(concrete.q).toBeGreaterThanOrEqual(2);
      expect(concrete.q).toBeLessThanOrEqual(10);
    }
  });

  it('a is always within [2, tableMax]', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = division.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { tableMax: 10 } } as Band,
        createSeededRng(seed)
      ) as { a: number };
      expect(concrete.a).toBeGreaterThanOrEqual(2);
      expect(concrete.a).toBeLessThanOrEqual(10);
    }
  });

  it('c is always exactly divisible by a (no remainder)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = division.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { tableMax: 5 } } as Band,
        createSeededRng(seed)
      ) as { a: number; c: number };
      expect(concrete.c % concrete.a).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// expected === canonicalize(q)
// ---------------------------------------------------------------------------

describe('division — expected matches the pre-chosen quotient', () => {
  it('step.expected === canonicalize(q) across seeds', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(seed));
      const concrete = division.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { tableMax: 10 } } as Band,
        createSeededRng(seed)
      ) as { q: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.q));
    }
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('division — normalizationPolicy', () => {
  it('step carries SCALAR_INTEGER_POLICY', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inputMode — always 'number' (flat abstract, no CPA ladder)
// ---------------------------------------------------------------------------

describe('division — inputMode is always number (flat abstract)', () => {
  it('band 0 → "number" inputMode, "abstract" representation', () => {
    const task = division.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
  });

  it('band 1 → "number" inputMode, "abstract" representation', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// prompt.vars never contain the quotient (the answer)
// ---------------------------------------------------------------------------

describe('division — prompt vars do not contain the quotient', () => {
  it('step.prompt.vars carries only a and c, never q', () => {
    const task = division.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    const stepVars = task.steps[0].prompt.vars ?? {};
    expect('a' in stepVars).toBe(true);
    expect('c' in stepVars).toBe(true);
    expect('q' in stepVars).toBe(false);
  });

  it('problem.prompt.vars carries only a and c, never q', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    const problemVars = task.problem.prompt.vars ?? {};
    expect('a' in problemVars).toBe(true);
    expect('c' in problemVars).toBe(true);
    expect('q' in problemVars).toBe(false);
  });

  it('problem.prompt.vars matches step.prompt.vars (same known a, c)', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.vars).toEqual(task.steps[0].prompt.vars);
  });
});

// ---------------------------------------------------------------------------
// solution === steps[0].expected
// ---------------------------------------------------------------------------

describe('division — solution', () => {
  it('solution === steps[0].expected (single-step task)', () => {
    for (const difficulty of [BAND_0_DIFFICULTY, BAND_1_DIFFICULTY]) {
      const task = division.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[0].expected);
    }
  });

  it('solution is a canonical integer string', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// Single step
// ---------------------------------------------------------------------------

describe('division — single step emitted', () => {
  it('always emits exactly 1 step', () => {
    for (const difficulty of [BAND_0_DIFFICULTY, BAND_1_DIFFICULTY]) {
      const task = division.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('division — skillNode', () => {
  it('task.skillNode is "division"', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('division');
  });

  it('step.skillNode is "division"', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('division');
  });

  it('generator.skillNode is "division"', () => {
    expect(division.skillNode).toBe('division');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('division — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with the expected key', () => {
    const task = division.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('division.problem');
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('step.prompt is a LocalizedRef with the expected key', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('division.step.quotient');
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('division — elicitFromMastery propagation', () => {
  it('step.elicitFromMastery equals difficulty.elicitFromMastery', () => {
    const task = division.generate(BAND_1_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(BAND_1_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at band 0', () => {
    const task = division.generate(BAND_0_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('division.instantiate()', () => {
  it('returns an object with a, c, q', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { tableMax: 10 },
    };
    const result = division.instantiate(band, createSeededRng(FIXED_SEED)) as {
      a: number;
      c: number;
      q: number;
    };
    expect(typeof result.a).toBe('number');
    expect(typeof result.c).toBe('number');
    expect(typeof result.q).toBe('number');
    expect(result.c).toBe(result.a * result.q);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { tableMax: 5 },
    };
    const r1 = division.instantiate(band, createSeededRng(7)) as { a: number; c: number; q: number };
    const r2 = division.instantiate(band, createSeededRng(7)) as { a: number; c: number; q: number };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('division — narrowBandParams guard', () => {
  it('throws for missing tableMax', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: {}, // missing tableMax
    };
    expect(() => division.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[division] Band params have unexpected shape'
    );
  });

  it('throws for non-object params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: 'not-an-object',
    };
    expect(() => division.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[division] Band params have unexpected shape'
    );
  });
});
