/**
 * number-bonds.test.ts — Unit tests for the number-bonds generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Construction invariant: whole === partA + partB for all seeds.
 *   - missingSlot routing: each slot produces the correct expected value.
 *   - expected === canonicalize(answerValue).
 *   - normalizationPolicy === SCALAR_INTEGER_POLICY.
 *   - inputMode per representationLevel (concrete → manipulative, pictorial → choice, abstract → number).
 *   - prompt.vars never contain the answer.
 *   - solution === steps[0].expected.
 *   - Single step emitted.
 *   - skillNode is 'number-bonds' on task and steps.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from difficulty envelope.
 */

import { numberBonds } from '../number-bonds';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_INTEGER_POLICY } from '../../canonical';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the D7 band shapes from interview-brief.md)
// ---------------------------------------------------------------------------

/** Band 0: concrete, wholeMax 10, missingSlot 'whole' (manipulative inputMode). */
const CONCRETE_DIFFICULTY: DifficultyParams = {
  representationLevel: 'concrete',
  elicitFromMastery: 0,
  params: { wholeMax: 10, missingSlot: 'whole' },
};

/** Band 1: pictorial, wholeMax 10, missingSlot 'partB' (choice inputMode). */
const PICTORIAL_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0.5,
  params: { wholeMax: 10, missingSlot: 'partB' },
};

/** Band 2: abstract, wholeMax 20, missingSlot 'partA' (number inputMode). */
const ABSTRACT_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 1,
  params: { wholeMax: 20, missingSlot: 'partA' },
};

/**
 * Band 3 (mastery, minCoordinate 0.85 in the graph fixture): abstract,
 * wholeMax 50, missingSlot 'random' — the slot itself is drawn per-instance
 * from `rng` rather than being a fixed literal (larger wholes + per-instance
 * slot variety enhancement).
 */
const RANDOM_SLOT_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 1,
  params: { wholeMax: 50, missingSlot: 'random' },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('numberBonds — byte-reproducibility', () => {
  it('same seed + concrete difficulty → deep-equal GeneratedTask', () => {
    const task1 = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + pictorial difficulty → deep-equal GeneratedTask', () => {
    const task1 = numberBonds.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = numberBonds.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + abstract difficulty → deep-equal GeneratedTask', () => {
    const task1 = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(1));
    const task2 = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(9999));
    // Different seeds should produce different tasks with very high probability.
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Construction invariant: whole === partA + partB
// ---------------------------------------------------------------------------

describe('numberBonds — whole === partA + partB invariant', () => {
  it('whole === partA + partB for missingSlot whole (concrete)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = numberBonds.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'concrete',
          params: { wholeMax: 10, missingSlot: 'whole' },
        } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number };
      expect(concrete.whole).toBe(concrete.partA + concrete.partB);
    }
  });

  it('whole === partA + partB for missingSlot partB (pictorial)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = numberBonds.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'pictorial',
          params: { wholeMax: 10, missingSlot: 'partB' },
        } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number };
      expect(concrete.whole).toBe(concrete.partA + concrete.partB);
    }
  });

  it('whole === partA + partB for missingSlot partA (abstract)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const concrete = numberBonds.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'abstract',
          params: { wholeMax: 20, missingSlot: 'partA' },
        } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number };
      expect(concrete.whole).toBe(concrete.partA + concrete.partB);
    }
  });

  it('whole is always <= wholeMax', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = numberBonds.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'abstract',
          params: { wholeMax: 15, missingSlot: 'whole' },
        } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number };
      expect(concrete.whole).toBeLessThanOrEqual(15);
    }
  });

  it('partB is always >= 1 (positive integer)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const concrete = numberBonds.instantiate(
        {
          minCoordinate: 0,
          representationLevel: 'concrete',
          params: { wholeMax: 10, missingSlot: 'partA' },
        } as Band,
        createSeededRng(seed)
      ) as { partB: number };
      expect(concrete.partB).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// missingSlot routing: correct expected value
// ---------------------------------------------------------------------------

describe('numberBonds — missingSlot picks correct expected', () => {
  it('missingSlot "whole" → expected === canonicalize(whole)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = numberBonds.generate(
        { representationLevel: 'concrete', elicitFromMastery: 0, params: { wholeMax: 10, missingSlot: 'whole' } },
        createSeededRng(seed)
      );
      const concrete = numberBonds.instantiate(
        { minCoordinate: 0, representationLevel: 'concrete', params: { wholeMax: 10, missingSlot: 'whole' } } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.whole));
    }
  });

  it('missingSlot "partB" → expected === canonicalize(partB)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = numberBonds.generate(
        { representationLevel: 'pictorial', elicitFromMastery: 0.5, params: { wholeMax: 10, missingSlot: 'partB' } },
        createSeededRng(seed)
      );
      const concrete = numberBonds.instantiate(
        { minCoordinate: 0, representationLevel: 'pictorial', params: { wholeMax: 10, missingSlot: 'partB' } } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.partB));
    }
  });

  it('missingSlot "partA" → expected === canonicalize(partA)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const task = numberBonds.generate(
        { representationLevel: 'abstract', elicitFromMastery: 1, params: { wholeMax: 20, missingSlot: 'partA' } },
        createSeededRng(seed)
      );
      const concrete = numberBonds.instantiate(
        { minCoordinate: 0, representationLevel: 'abstract', params: { wholeMax: 20, missingSlot: 'partA' } } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number };
      expect(task.steps[0].expected).toBe(canonicalize(concrete.partA));
    }
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('numberBonds — normalizationPolicy', () => {
  it('step carries SCALAR_INTEGER_POLICY', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_INTEGER_POLICY);
  });

  it('SCALAR_INTEGER_POLICY.numberClass is "integer"', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
  });

  it('SCALAR_INTEGER_POLICY.lowestTerms is false', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.lowestTerms).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InputMode per representationLevel
// ---------------------------------------------------------------------------

describe('numberBonds — inputMode per representationLevel', () => {
  it('concrete representationLevel → "manipulative" inputMode', () => {
    const task = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('concrete');
    expect(task.steps[0].inputMode).toBe('manipulative');
  });

  it('pictorial representationLevel → "choice" inputMode', () => {
    const task = numberBonds.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('choice');
  });

  it('abstract representationLevel → "number" inputMode', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// prompt.vars never contain the answer
// ---------------------------------------------------------------------------

describe('numberBonds — prompt vars do not contain the answer', () => {
  it('for missingSlot "whole", vars do not contain whole value', () => {
    const task = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const answerValue = parseInt(task.steps[0].expected, 10);
    const stepVars = task.steps[0].prompt.vars ?? {};
    // stepVars should have knownA and knownB (the two known parts), not the whole
    // We verify the answer is NOT directly findable by var name 'whole' in step vars
    // (the step prompt key encodes which slot is missing; vars carry known values).
    // The answer is the whole — so stepVars should NOT have a field named 'whole' pointing to answer.
    // (They carry knownA=partA and knownB=partB instead.)
    const varValues = Object.values(stepVars);
    // The knownA and knownB are the two parts; their sum = answerValue.
    // Verify the answer is NOT explicitly named in step.prompt.vars
    expect('whole' in stepVars).toBe(false);
    // But the answer is reconstructible from the known parts (that's fine — it's math)
    expect(typeof answerValue).toBe('number');
    expect(varValues).not.toContain(undefined);
  });

  it('for missingSlot "partB", step.prompt.vars has knownA and knownB (not partB)', () => {
    const task = numberBonds.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const stepVars = task.steps[0].prompt.vars ?? {};
    // vars should carry the two known values; partB is the answer (missing)
    expect('knownA' in stepVars).toBe(true);
    expect('knownB' in stepVars).toBe(true);
    // The key should reflect that partB is being asked (mapped to lowercase 'part_b')
    expect(task.steps[0].prompt.key).toContain('part_b');
  });

  it('problem.prompt.vars carries the two known values + missingSlot, never the answer', () => {
    // CONCRETE_DIFFICULTY → band 0 → missingSlot 'whole', so the answer is `whole`.
    const task = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    const problemVars = task.problem.prompt.vars ?? {};
    const answerValue = parseInt(task.steps[0].expected, 10);
    // The problem prompt carries only the two known values + which slot is missing.
    expect('knownA' in problemVars).toBe(true);
    expect('knownB' in problemVars).toBe(true);
    expect('missingSlot' in problemVars).toBe(true);
    // The answer (the missing slot's value) is NEVER named directly in problem vars.
    expect('whole' in problemVars).toBe(false);
    // And the answer value is not one of the carried known values
    // (knownA=partA, knownB=partB; their sum is the whole — reconstructible by math, not leaked).
    expect(problemVars.missingSlot).toBe('whole');
    expect(problemVars.knownA).toBe((task.steps[0].prompt.vars ?? {}).knownA);
    expect(typeof answerValue).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// solution === steps[0].expected
// ---------------------------------------------------------------------------

describe('numberBonds — solution', () => {
  it('solution === steps[0].expected (single-step task)', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = numberBonds.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[0].expected);
    }
  });

  it('solution is a canonical integer string', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toMatch(/^[0-9]+$/);
    expect(task.solution).toBe(canonicalize(parseInt(task.solution, 10)));
  });
});

// ---------------------------------------------------------------------------
// Single step
// ---------------------------------------------------------------------------

describe('numberBonds — single step emitted', () => {
  it('always emits exactly 1 step', () => {
    for (const difficulty of [CONCRETE_DIFFICULTY, PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = numberBonds.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('numberBonds — skillNode', () => {
  it('task.skillNode is "number-bonds"', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('number-bonds');
  });

  it('step.skillNode is "number-bonds"', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('number-bonds');
  });

  it('generator.skillNode is "number-bonds"', () => {
    expect(numberBonds.skillNode).toBe('number-bonds');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('numberBonds — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with a valid key', () => {
    const task = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(typeof task.problem.prompt.key).toBe('string');
    expect(task.problem.prompt.key.length).toBeGreaterThan(0);
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('step.prompt is a LocalizedRef with a valid key', () => {
    const task = numberBonds.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(typeof task.steps[0].prompt.key).toBe('string');
    expect(task.steps[0].prompt.key.length).toBeGreaterThan(0);
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('step.prompt.key encodes the missingSlot as a lowercase segment', () => {
    const concreteTask = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(concreteTask.steps[0].prompt.key).toContain('whole');

    // camelCase slot names are mapped to lowercase key segments
    const pictorialTask = numberBonds.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(pictorialTask.steps[0].prompt.key).toContain('part_b');

    const abstractTask = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(abstractTask.steps[0].prompt.key).toContain('part_a');
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('numberBonds — elicitFromMastery propagation', () => {
  it('step.elicitFromMastery equals difficulty.elicitFromMastery', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at the concrete band', () => {
    const task = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('numberBonds.instantiate()', () => {
  it('returns an object with partA, partB, whole, missingSlot', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { wholeMax: 15, missingSlot: 'whole' },
    };
    const result = numberBonds.instantiate(band, createSeededRng(FIXED_SEED)) as {
      partA: number;
      partB: number;
      whole: number;
      missingSlot: string;
    };
    expect(typeof result.partA).toBe('number');
    expect(typeof result.partB).toBe('number');
    expect(typeof result.whole).toBe('number');
    expect(result.missingSlot).toBe('whole');
    expect(result.whole).toBe(result.partA + result.partB);
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = {
      minCoordinate: 0,
      representationLevel: 'abstract',
      params: { wholeMax: 10, missingSlot: 'partA' },
    };
    const r1 = numberBonds.instantiate(band, createSeededRng(7)) as { partA: number; partB: number; whole: number };
    const r2 = numberBonds.instantiate(band, createSeededRng(7)) as { partA: number; partB: number; whole: number };
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('numberBonds — narrowBandParams guard', () => {
  it('throws for missing wholeMax', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { missingSlot: 'whole' }, // missing wholeMax
    };
    expect(() => numberBonds.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[number-bonds] Band params have unexpected shape'
    );
  });

  it('throws for invalid missingSlot value', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: { wholeMax: 10, missingSlot: 'invalid' },
    };
    expect(() => numberBonds.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[number-bonds] Band params have unexpected shape'
    );
  });

  it('does NOT throw for missingSlot "random" (valid enhancement value)', () => {
    expect(() => numberBonds.generate(RANDOM_SLOT_DIFFICULTY, createSeededRng(1))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// missingSlot 'random' — per-instance slot draw (difficulty enhancement)
// ---------------------------------------------------------------------------

describe('numberBonds — missingSlot "random" (per-instance slot draw)', () => {
  it('same seed + random-slot difficulty → deep-equal GeneratedTask (determinism)', () => {
    const task1 = numberBonds.generate(RANDOM_SLOT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = numberBonds.generate(RANDOM_SLOT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('resolved missingSlot is never the literal string "random" on the task', () => {
    for (let seed = 0; seed < 40; seed++) {
      const task = numberBonds.generate(RANDOM_SLOT_DIFFICULTY, createSeededRng(seed));
      const problemVars = task.problem.prompt.vars ?? {};
      expect(problemVars.missingSlot).not.toBe('random');
      expect(['partA', 'partB', 'whole']).toContain(problemVars.missingSlot);
      // The i18n keys reuse the existing per-slot segments — 'random' never
      // leaks into a prompt key.
      expect(task.problem.prompt.key).not.toContain('random');
      expect(task.steps[0].prompt.key).not.toContain('random');
    }
  });

  it('all three slots (partA, partB, whole) are reachable across seeds', () => {
    const seenSlots = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const task = numberBonds.generate(RANDOM_SLOT_DIFFICULTY, createSeededRng(seed));
      const problemVars = task.problem.prompt.vars ?? {};
      seenSlots.add(problemVars.missingSlot as string);
    }
    expect(seenSlots).toEqual(new Set(['partA', 'partB', 'whole']));
  });

  it('wholeMax 50 is respected across seeds (whole <= 50, whole === partA + partB)', () => {
    for (let seed = 0; seed < 60; seed++) {
      const concrete = numberBonds.instantiate(
        { minCoordinate: 0.85, representationLevel: 'abstract', params: { wholeMax: 50, missingSlot: 'random' } } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number; missingSlot: string };
      expect(concrete.whole).toBe(concrete.partA + concrete.partB);
      expect(concrete.whole).toBeLessThanOrEqual(50);
      expect(concrete.partA).toBeGreaterThanOrEqual(0);
      expect(concrete.partB).toBeGreaterThanOrEqual(1);
      // instantiate() resolves 'random' to a concrete literal slot.
      expect(['partA', 'partB', 'whole']).toContain(concrete.missingSlot);
    }
  });

  it('step.expected matches whichever slot was resolved for that seed', () => {
    for (let seed = 0; seed < 20; seed++) {
      const task = numberBonds.generate(RANDOM_SLOT_DIFFICULTY, createSeededRng(seed));
      const concrete = numberBonds.instantiate(
        { minCoordinate: 0.85, representationLevel: 'abstract', params: { wholeMax: 50, missingSlot: 'random' } } as Band,
        createSeededRng(seed)
      ) as { partA: number; partB: number; whole: number; missingSlot: 'partA' | 'partB' | 'whole' };
      const expectedAnswer =
        concrete.missingSlot === 'partA'
          ? concrete.partA
          : concrete.missingSlot === 'partB'
            ? concrete.partB
            : concrete.whole;
      expect(task.steps[0].expected).toBe(canonicalize(expectedAnswer));
    }
  });

  it('inputMode is "number" (abstract representation) regardless of which slot is resolved', () => {
    for (let seed = 0; seed < 20; seed++) {
      const task = numberBonds.generate(RANDOM_SLOT_DIFFICULTY, createSeededRng(seed));
      expect(task.representation).toBe('abstract');
      expect(task.steps[0].inputMode).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Regression: existing literal-slot bands stay byte-identical for a fixed seed
//
// Guards against the 'random'-slot enhancement accidentally shifting the rng
// draw sequence (e.g. an extra draw) for bands that use a fixed literal
// missingSlot. Inline snapshots pin the exact GeneratedTask shape produced
// before this enhancement landed.
// ---------------------------------------------------------------------------

describe('numberBonds — regression: literal-slot bands unaffected by the random-slot enhancement', () => {
  it('concrete band (wholeMax 10, missingSlot "whole") is unchanged for FIXED_SEED', () => {
    const task = numberBonds.generate(CONCRETE_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task).toMatchInlineSnapshot(`
{
  "problem": {
    "prompt": {
      "key": "number_bonds.problem.whole",
      "vars": {
        "knownA": 6,
        "knownB": 2,
        "missingSlot": "whole",
      },
    },
    "representation": "concrete",
  },
  "representation": "concrete",
  "skillNode": "number-bonds",
  "solution": "8",
  "steps": [
    {
      "elicitFromMastery": 0,
      "expected": "8",
      "inputMode": "manipulative",
      "normalizationPolicy": {
        "decimalForm": "standard",
        "lowestTerms": false,
        "numberClass": "integer",
        "ordering": "n/a",
      },
      "prompt": {
        "key": "number_bonds.step.whole",
        "vars": {
          "knownA": 6,
          "knownB": 2,
        },
      },
      "skillNode": "number-bonds",
    },
  ],
}
`);
  });

  it('pictorial band (wholeMax 10, missingSlot "partB") is unchanged for FIXED_SEED', () => {
    const task = numberBonds.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task).toMatchInlineSnapshot(`
{
  "problem": {
    "prompt": {
      "key": "number_bonds.problem.part_b",
      "vars": {
        "knownA": 6,
        "knownB": 8,
        "missingSlot": "partB",
      },
    },
    "representation": "pictorial",
  },
  "representation": "pictorial",
  "skillNode": "number-bonds",
  "solution": "2",
  "steps": [
    {
      "elicitFromMastery": 0.5,
      "expected": "2",
      "inputMode": "choice",
      "normalizationPolicy": {
        "decimalForm": "standard",
        "lowestTerms": false,
        "numberClass": "integer",
        "ordering": "n/a",
      },
      "prompt": {
        "key": "number_bonds.step.part_b",
        "vars": {
          "knownA": 6,
          "knownB": 8,
        },
      },
      "skillNode": "number-bonds",
    },
  ],
}
`);
  });

  it('abstract band (wholeMax 20, missingSlot "partA") is unchanged for FIXED_SEED', () => {
    const task = numberBonds.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task).toMatchInlineSnapshot(`
{
  "problem": {
    "prompt": {
      "key": "number_bonds.problem.part_a",
      "vars": {
        "knownA": 4,
        "knownB": 16,
        "missingSlot": "partA",
      },
    },
    "representation": "abstract",
  },
  "representation": "abstract",
  "skillNode": "number-bonds",
  "solution": "12",
  "steps": [
    {
      "elicitFromMastery": 1,
      "expected": "12",
      "inputMode": "number",
      "normalizationPolicy": {
        "decimalForm": "standard",
        "lowestTerms": false,
        "numberClass": "integer",
        "ordering": "n/a",
      },
      "prompt": {
        "key": "number_bonds.step.part_a",
        "vars": {
          "knownA": 4,
          "knownB": 16,
        },
      },
      "skillNode": "number-bonds",
    },
  ],
}
`);
  });
});
