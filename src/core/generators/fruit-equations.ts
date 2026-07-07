/**
 * fruit-equations.ts — The fruit-equations generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers for MVP).
 *
 * FRUIT-EQUATIONS CONCEPT — a SOLVABLE fruit puzzle (the "pictorial bridge" to
 * algebra, where a fruit icon stands for an unknown number):
 *
 *   One unknown (a coefficient equation → real division):
 *     🍎 × 3 = 12        find 🍎  → 4
 *
 *   Two unknowns (a triangular 2-equation system → division, then subtraction):
 *     🍎 × 3 = 12        find 🍎  → 4
 *     🍎 + 🍌 = 6        find 🍌  → 2   (using the 🍎 just found)
 *
 *   Every task has exactly ONE answer per fruit that the learner can actually
 *   deduce — never underdetermined. The coefficient is drawn ≥ 2 so the one-
 *   fruit case is genuine arithmetic (never the degenerate 🍎 = total).
 *
 * BAND PARAMS (`params: { unknowns: number; range: number; negatives: boolean }`):
 *   - unknowns: how many distinct fruit types are solved for (1 or 2).
 *   - range: each fruit value is drawn from [1, range] (or [-range, range] if negatives).
 *     When negatives is true, the sign is drawn uniformly; zero is excluded.
 *   - negatives: whether drawn fruit values may be negative.
 *
 * STEPS (one per unknown, in solving order):
 *   For unknowns === 1: one step ("what is 🍎?").
 *   For unknowns === 2: two ordered steps ("what is 🍎?", then "what is 🍌?").
 *   Each step.expected is canonicalize(fruitValue) — never ad-hoc formatted.
 *   Each step carries SCALAR_DECIMAL_POLICY so the stage-03 checker reads the
 *   identical policy off the same Step object (DL-3; divergence impossible).
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and each step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys and
 *   renders the equations from the numeric vars (coefficients, totals).
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. Steps are ordered sub-answers,
 *   not "correct/wrong" verdicts (that is stage-03's concern).
 *
 * LINT:
 *   All randomness is drawn through the `rng` parameter.
 *   `Math.random` is banned in src/core/** by the no-adhoc-number-format rule.
 */

import type {
  Generator,
  GeneratedTask,
  DifficultyParams,
  Band,
  SeededRng,
  Step,
  LocalizedRef,
} from '@/core/types';
import { canonicalize, SCALAR_DECIMAL_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (fruit-equations specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for fruit-equations.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface FruitBandParams {
  /** Number of distinct fruit types solved for: 1 or 2. */
  readonly unknowns: number;
  /** Draw range: fruit values drawn from [1..range] (or negatives). */
  readonly range: number;
  /** Whether negative values are allowed (only on higher difficulty bands). */
  readonly negatives: boolean;
}

/**
 * Narrow `band.params` to `FruitBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): FruitBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).unknowns !== 'number' ||
    typeof (params as Record<string, unknown>).range !== 'number' ||
    typeof (params as Record<string, unknown>).negatives !== 'boolean'
  ) {
    throw new Error(
      '[fruit-equations] Band params have unexpected shape. ' +
        'Expected { unknowns: number; range: number; negatives: boolean }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as FruitBandParams;
}

// ---------------------------------------------------------------------------
// Coefficient range for the one-fruit equation (🍎 × coeff = total).
// Always ≥ 2 so the task is real division, never the degenerate 🍎 = total.
// ---------------------------------------------------------------------------

const MIN_COEFF = 2;
const MAX_COEFF = 3;

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 *
 * Equations (backward-constructed from the drawn fruit values):
 *   coeffA × apple = total1        (always present)
 *   apple + banana = total2        (only when unknowns === 2)
 */
interface FruitConcreteParams {
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
  /** How many fruits are solved for: 1 or 2. */
  readonly unknowns: 1 | 2;
  /** The value of 🍎 — the answer to step 1. */
  readonly apple: number;
  /** Coefficient in equation 1: coeffA × apple = total1 (≥ 2). */
  readonly coeffA: number;
  /** Right-hand side of equation 1 (= coeffA * apple). */
  readonly total1: number;
  /** The value of 🍌 — the answer to step 2 (unknowns === 2 only). */
  readonly banana?: number;
  /** Right-hand side of equation 2 (= apple + banana; unknowns === 2 only). */
  readonly total2?: number;
}

// ---------------------------------------------------------------------------
// drawValue — draw a single fruit value honoring the negatives flag
// ---------------------------------------------------------------------------

/**
 * Draw one fruit value. Positive-only bands draw from [1, range]; negatives
 * bands draw a non-zero value in [-range, range] (magnitude then sign, so 0 is
 * excluded). All randomness flows through `rng`.
 */
function drawValue(range: number, negatives: boolean, rng: SeededRng): number {
  if (negatives) {
    const magnitude = rng.nextInt(1, range);
    const sign = rng.nextInt(0, 1) === 0 ? 1 : -1;
    return sign * magnitude;
  }
  return rng.nextInt(1, range);
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): FruitConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws concrete
 * fruit values from `rng` FIRST (backward generation) and derives the equation
 * totals from them. The system is triangular and always uniquely solvable:
 * equation 1 fixes 🍎 (division), equation 2 fixes 🍌 given 🍎 (subtraction).
 *
 * Draw order (fixed for reproducibility): apple, coeffA, [banana].
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer values.
 */
function instantiate(band: Band, rng: SeededRng): FruitConcreteParams {
  const p = narrowBandParams(band.params);

  // Clamp unknowns to the supported 1..2 range.
  const unknowns = (Math.min(Math.max(1, p.unknowns), 2)) as 1 | 2;

  // Draw 🍎 (the answer) and the coefficient; derive equation-1 total.
  const apple = drawValue(p.range, p.negatives, rng);
  const coeffA = rng.nextInt(MIN_COEFF, MAX_COEFF);
  const total1 = coeffA * apple;

  if (unknowns === 2) {
    // Draw 🍌 (the answer) and derive equation-2 total (🍎 + 🍌).
    const banana = drawValue(p.range, p.negatives, rng);
    const total2 = apple + banana;
    return {
      representationLevel: band.representationLevel,
      unknowns,
      apple,
      coeffA,
      total1,
      banana,
      total2,
    };
  }

  return {
    representationLevel: band.representationLevel,
    unknowns,
    apple,
    coeffA,
    total1,
  };
}

// ---------------------------------------------------------------------------
// generate — the public backward-generation entry
// ---------------------------------------------------------------------------

/**
 * generate(difficulty, rng): GeneratedTask
 *
 * BYTE REPRODUCIBILITY:
 *   same `difficulty` + same `rng` seed → identical `GeneratedTask`.
 *   All randomness flows through `rng`; no Date.now(), no Math.random().
 */
function generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
  // Build a temporary Band from the difficulty envelope's params and representationLevel.
  // The `difficulty.params` IS the band.params (forwarded by the scheduler/engine).
  const bandFromDifficulty: Band = {
    minCoordinate: 0, // not needed for instantiate — only params and representationLevel matter.
    representationLevel: difficulty.representationLevel,
    params: difficulty.params,
  };

  const concrete = instantiate(bandFromDifficulty, rng) as FruitConcreteParams;

  // pictorial → 'tokens' (assemble the number from a digit palette),
  // concrete/abstract → 'number' (numeric keypad).
  const inputMode: 'tokens' | 'number' =
    concrete.representationLevel === 'pictorial' ? 'tokens' : 'number';

  const makeStep = (key: string, recapKey: string, value: number): Step => ({
    prompt: { key },
    // recap: a short fruit label so a two-fruit task can show the already-solved
    // fruit (e.g. "🍎 = 2") while the learner works the second fruit.
    recap: { key: recapKey },
    inputMode,
    // expected is the canonical string of the pre-chosen fruit value.
    expected: canonicalize(value),
    skillNode: 'fruit-equations',
    // elicitFromMastery: propagate from the difficulty envelope (stage-04 interprets it).
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_DECIMAL_POLICY,
  });

  // Ordered steps, in solving order: 🍎 first (equation 1), then 🍌 (equation 2).
  const steps: Step[] = [makeStep('fruit_eq.step.apple', 'fruit_eq.recap.apple', concrete.apple)];
  if (concrete.unknowns === 2) {
    steps.push(makeStep('fruit_eq.step.banana', 'fruit_eq.recap.banana', concrete.banana as number));
  }

  // Problem prompt: carries the numeric coefficients/totals so the presentation
  // layer renders the actual equation(s). NEVER the answer values themselves.
  const problemPrompt: LocalizedRef =
    concrete.unknowns === 1
      ? {
          key: 'fruit_eq.problem.unknowns_1',
          vars: { coeff: concrete.coeffA, total: concrete.total1 },
        }
      : {
          key: 'fruit_eq.problem.unknowns_2',
          vars: {
            coeffA: concrete.coeffA,
            total1: concrete.total1,
            total2: concrete.total2 as number,
          },
        };

  // solution = the canonical sum of the answers the learner produces (🍎, or
  // 🍎 + 🍌). Used only as `correctAnswer` in the explanation context; the
  // checker verifies each step against step.expected, not this field.
  const solutionValue =
    concrete.unknowns === 1 ? concrete.apple : concrete.apple + (concrete.banana as number);
  const solution = canonicalize(solutionValue);

  return {
    problem: {
      prompt: problemPrompt,
      representation: concrete.representationLevel,
    },
    solution,
    steps,
    representation: concrete.representationLevel,
    skillNode: 'fruit-equations',
  };
}

// ---------------------------------------------------------------------------
// The fruit-equations Generator implementation
// ---------------------------------------------------------------------------

/**
 * fruitEquations — the `Generator` implementation for the 'fruit-equations' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key `'fruit-equations'`.
 * The registry's `assertEveryGeneratorHasNode` verifies this key matches a graph node.
 */
export const fruitEquations: Generator = {
  skillNode: 'fruit-equations',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
