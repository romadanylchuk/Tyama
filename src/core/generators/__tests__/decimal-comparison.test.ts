/**
 * decimal-comparison.test.ts — Unit tests for the decimal-comparison generator.
 *
 * Tests:
 *   - Byte-reproducibility: same seed + difficulty → identical GeneratedTask.
 *   - Answer-is-strictly-larger invariant: the value canonicalize()'d into
 *     step.expected is always strictly greater than the other displayed value.
 *   - The distractor always has MORE decimal digits than the answer (the
 *     classic misconception the generator is designed to exercise).
 *   - expected === canonicalize(the larger of left/right).
 *   - normalizationPolicy === SCALAR_DECIMAL_POLICY.
 *   - inputMode is always 'compare', regardless of representationLevel.
 *   - Canonical round-trip: parseLocaleNumber(canonicalDisplay) → canonicalize()
 *     reproduces step.expected under BOTH 'uk' and 'en' locale profiles (the
 *     load-bearing 02<->03 canonical-standard invariant).
 *   - solution === steps[0].expected.
 *   - Single step emitted.
 *   - skillNode is 'decimal-comparison' on task, steps, and generator.
 *   - Language-neutral LocalizedRef keys.
 *   - instantiate is reproducible.
 *   - elicitFromMastery propagated from the difficulty envelope.
 *   - answer position (left vs right) varies across seeds.
 *   - narrowBandParams guard rejects malformed band params.
 */

import { decimalComparison } from '../decimal-comparison';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, SCALAR_DECIMAL_POLICY } from '../../canonical';
import { parseLocaleNumber, resolveLocaleProfile } from '@/parsing';
import type { DifficultyParams, Band } from '../../types';

// ---------------------------------------------------------------------------
// Fixture difficulty params (mirror the shipped bandsSuggestion defaults)
// ---------------------------------------------------------------------------

/** Band 0: pictorial, maxWhole 5. */
const PICTORIAL_DIFFICULTY: DifficultyParams = {
  representationLevel: 'pictorial',
  elicitFromMastery: 0,
  params: { maxWhole: 5 },
};

/** Band 1: abstract, maxWhole 9. */
const ABSTRACT_DIFFICULTY: DifficultyParams = {
  representationLevel: 'abstract',
  elicitFromMastery: 0.5,
  params: { maxWhole: 9 },
};

const FIXED_SEED = 42;

// ---------------------------------------------------------------------------
// Byte-reproducibility
// ---------------------------------------------------------------------------

describe('decimalComparison — byte-reproducibility', () => {
  it('same seed + pictorial difficulty → deep-equal GeneratedTask', () => {
    const task1 = decimalComparison.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = decimalComparison.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('same seed + abstract difficulty → deep-equal GeneratedTask', () => {
    const task1 = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    const task2 = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task1).toEqual(task2);
  });

  it('different seeds → different tasks (probabilistically)', () => {
    const task1 = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(1));
    const task2 = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(9999));
    expect(task1).not.toEqual(task2);
  });
});

// ---------------------------------------------------------------------------
// Answer-is-strictly-larger invariant
// ---------------------------------------------------------------------------

describe('decimalComparison — the answer is always the strictly larger value', () => {
  it('canonicalize(max(left, right)) === step.expected across many seeds', () => {
    for (let seed = 0; seed < 40; seed++) {
      const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const step = task.steps[0];
      const vars = step.prompt.vars as { left: number; right: number };
      const larger = Math.max(vars.left, vars.right);
      expect(step.expected).toBe(canonicalize(larger));
      // Strictness: the two displayed values are never equal.
      expect(vars.left).not.toBe(vars.right);
    }
  });

  it('the distractor always has strictly more decimal digits than the answer', () => {
    for (let seed = 0; seed < 40; seed++) {
      const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const vars = task.steps[0].prompt.vars as { left: number; right: number };
      const larger = Math.max(vars.left, vars.right);
      const smaller = Math.min(vars.left, vars.right);

      const decimalDigits = (n: number): number => {
        const s = canonicalize(n);
        const dot = s.indexOf('.');
        return dot === -1 ? 0 : s.length - dot - 1;
      };

      expect(decimalDigits(larger)).toBe(1);
      expect(decimalDigits(smaller)).toBe(2);
    }
  });

  it('instantiate: smaller < larger for all seeds', () => {
    const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxWhole: 9 } };
    for (let seed = 0; seed < 40; seed++) {
      const concrete = decimalComparison.instantiate(band, createSeededRng(seed)) as {
        larger: number;
        smaller: number;
      };
      expect(concrete.smaller).toBeLessThan(concrete.larger);
    }
  });
});

// ---------------------------------------------------------------------------
// normalizationPolicy
// ---------------------------------------------------------------------------

describe('decimalComparison — normalizationPolicy', () => {
  it('step carries SCALAR_DECIMAL_POLICY', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy).toEqual(SCALAR_DECIMAL_POLICY);
  });

  it('SCALAR_DECIMAL_POLICY.numberClass is "decimal"', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('decimal');
  });
});

// ---------------------------------------------------------------------------
// inputMode is always 'compare'
// ---------------------------------------------------------------------------

describe('decimalComparison — inputMode is always "compare"', () => {
  it('pictorial representationLevel → "compare" inputMode', () => {
    const task = decimalComparison.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('pictorial');
    expect(task.steps[0].inputMode).toBe('compare');
  });

  it('abstract representationLevel → "compare" inputMode', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.representation).toBe('abstract');
    expect(task.steps[0].inputMode).toBe('compare');
  });
});

// ---------------------------------------------------------------------------
// Canonical round-trip through parseLocaleNumber (the 02<->03 spine invariant)
// ---------------------------------------------------------------------------

describe('decimalComparison — canonical round-trip under uk AND en locale profiles', () => {
  it('parseLocaleNumber(canonical display) → canonicalize() reproduces step.expected (uk)', () => {
    const ukProfile = resolveLocaleProfile('uk');
    for (let seed = 0; seed < 20; seed++) {
      const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const step = task.steps[0];
      // Simulate what build-widget-config produces: canonical form with the
      // locale decimal separator substituted for '.'.
      const ukDisplay = step.expected.replace('.', ukProfile.decimalSep);
      const parsed = parseLocaleNumber(ukDisplay, ukProfile);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(canonicalize(parsed.value)).toBe(step.expected);
      }
    }
  });

  it('parseLocaleNumber(canonical display) → canonicalize() reproduces step.expected (en)', () => {
    const enProfile = resolveLocaleProfile('en');
    for (let seed = 0; seed < 20; seed++) {
      const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const step = task.steps[0];
      // 'en' decimalSep is '.' — the canonical form IS the display form.
      const enDisplay = step.expected.replace('.', enProfile.decimalSep);
      const parsed = parseLocaleNumber(enDisplay, enProfile);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(canonicalize(parsed.value)).toBe(step.expected);
      }
    }
  });

  it('the DISTRACTOR also round-trips under both locales (tapping it is never a silent misparse)', () => {
    const ukProfile = resolveLocaleProfile('uk');
    const enProfile = resolveLocaleProfile('en');
    for (let seed = 0; seed < 20; seed++) {
      const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const vars = task.steps[0].prompt.vars as { left: number; right: number };
      const smaller = Math.min(vars.left, vars.right);
      const canonicalSmaller = canonicalize(smaller);

      const ukParsed = parseLocaleNumber(canonicalSmaller.replace('.', ukProfile.decimalSep), ukProfile);
      expect(ukParsed.ok).toBe(true);
      if (ukParsed.ok) expect(canonicalize(ukParsed.value)).toBe(canonicalSmaller);

      const enParsed = parseLocaleNumber(canonicalSmaller.replace('.', enProfile.decimalSep), enProfile);
      expect(enParsed.ok).toBe(true);
      if (enParsed.ok) expect(canonicalize(enParsed.value)).toBe(canonicalSmaller);
    }
  });
});

// ---------------------------------------------------------------------------
// solution
// ---------------------------------------------------------------------------

describe('decimalComparison — solution', () => {
  it('solution === steps[0].expected (single-step task)', () => {
    for (const difficulty of [PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = decimalComparison.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.solution).toBe(task.steps[0].expected);
    }
  });

  it('solution is a canonical decimal string', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.solution).toBe(canonicalize(Number(task.solution)));
  });
});

// ---------------------------------------------------------------------------
// Single step
// ---------------------------------------------------------------------------

describe('decimalComparison — single step emitted', () => {
  it('always emits exactly 1 step', () => {
    for (const difficulty of [PICTORIAL_DIFFICULTY, ABSTRACT_DIFFICULTY]) {
      const task = decimalComparison.generate(difficulty, createSeededRng(FIXED_SEED));
      expect(task.steps).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// skillNode
// ---------------------------------------------------------------------------

describe('decimalComparison — skillNode', () => {
  it('task.skillNode is "decimal-comparison"', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.skillNode).toBe('decimal-comparison');
  });

  it('step.skillNode is "decimal-comparison"', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].skillNode).toBe('decimal-comparison');
  });

  it('generator.skillNode is "decimal-comparison"', () => {
    expect(decimalComparison.skillNode).toBe('decimal-comparison');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral LocalizedRef keys
// ---------------------------------------------------------------------------

describe('decimalComparison — language-neutral LocalizedRef', () => {
  it('problem.prompt is a LocalizedRef with the expected key', () => {
    const task = decimalComparison.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.key).toBe('decimal_compare.problem');
    expect(task.problem.prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('step.prompt is a LocalizedRef with the expected key', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].prompt.key).toBe('decimal_compare.step.larger');
    expect(task.steps[0].prompt.key).toMatch(/^[a-z_][a-z0-9._]*$/);
  });

  it('problem.prompt.vars matches step.prompt.vars (same left/right pair)', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.problem.prompt.vars).toEqual(task.steps[0].prompt.vars);
  });
});

// ---------------------------------------------------------------------------
// elicitFromMastery propagated
// ---------------------------------------------------------------------------

describe('decimalComparison — elicitFromMastery propagation', () => {
  it('step.elicitFromMastery equals difficulty.elicitFromMastery', () => {
    const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(ABSTRACT_DIFFICULTY.elicitFromMastery);
  });

  it('step.elicitFromMastery is 0 at the pictorial band', () => {
    const task = decimalComparison.generate(PICTORIAL_DIFFICULTY, createSeededRng(FIXED_SEED));
    expect(task.steps[0].elicitFromMastery).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Answer position varies by seed
// ---------------------------------------------------------------------------

describe('decimalComparison — answer display position varies by seed', () => {
  it('the larger value is not always on the same side across seeds', () => {
    const positions = new Set<'left' | 'right'>();
    for (let seed = 0; seed < 30; seed++) {
      const task = decimalComparison.generate(ABSTRACT_DIFFICULTY, createSeededRng(seed));
      const vars = task.steps[0].prompt.vars as { left: number; right: number };
      positions.add(vars.left > vars.right ? 'left' : 'right');
    }
    // Both positions must occur across a large enough seed sample —
    // otherwise the answer would be positionally guessable.
    expect(positions.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// instantiate reproducibility
// ---------------------------------------------------------------------------

describe('decimalComparison.instantiate()', () => {
  it('returns an object with larger, smaller, left, right', () => {
    const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxWhole: 9 } };
    const result = decimalComparison.instantiate(band, createSeededRng(FIXED_SEED)) as {
      larger: number;
      smaller: number;
      left: number;
      right: number;
    };
    expect(typeof result.larger).toBe('number');
    expect(typeof result.smaller).toBe('number');
    expect(result.smaller).toBeLessThan(result.larger);
    expect([result.left, result.right].sort((a, b) => a - b)).toEqual(
      [result.smaller, result.larger].sort((a, b) => a - b)
    );
  });

  it('instantiate is reproducible with the same seed', () => {
    const band: Band = { minCoordinate: 0, representationLevel: 'abstract', params: { maxWhole: 9 } };
    const r1 = decimalComparison.instantiate(band, createSeededRng(7));
    const r2 = decimalComparison.instantiate(band, createSeededRng(7));
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// narrowBandParams guard
// ---------------------------------------------------------------------------

describe('decimalComparison — narrowBandParams guard', () => {
  it('throws for missing maxWhole', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: {}, // missing maxWhole
    };
    expect(() => decimalComparison.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[decimal-comparison] Band params have unexpected shape'
    );
  });

  it('throws for non-object params', () => {
    const badDifficulty: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 0,
      params: 'not-an-object',
    };
    expect(() => decimalComparison.generate(badDifficulty, createSeededRng(1))).toThrow(
      '[decimal-comparison] Band params have unexpected shape'
    );
  });
});
