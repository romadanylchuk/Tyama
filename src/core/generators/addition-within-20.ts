/**
 * addition-within-20.ts — The addition-within-20 generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * ADDITION-WITHIN-20 CONCEPT:
 *   A simple addition fact: a + b = sum. The learner is shown the two addends
 *   and must supply the sum. Backward construction: draw the SUM first (the
 *   answer), then split it into two addends a + b = sum. This mirrors the
 *   number-bonds `missingSlot: 'whole'` shape but is a dedicated, simpler
 *   generator: addition-within-20 always asks for the sum, never a part.
 *
 * BAND PARAMS (`params: { maxTotal: number }`):
 *   - maxTotal: the maximum value for the sum (inclusive upper bound).
 *     Draw the sum c from [2, maxTotal] (2 is the smallest possible sum of
 *     two positive integer addends), then split into a from [1, c-1] and
 *     b = c - a (both addends are always >= 1).
 *
 * CPA LADDER (shipped defaults, pedagogy-pass calibrates later):
 *   Band 0 concrete  [0.0, 0.4) → maxTotal 10 → 'manipulative' inputMode
 *   Band 1 pictorial [0.4, 0.7) → maxTotal 15 → 'choice' inputMode
 *   Band 2 abstract  [0.7, 1.0+) → maxTotal 20 → 'number' inputMode
 *
 * STEPS:
 *   A single integer step — the sum.
 *   step.expected = canonicalize(sum) via SCALAR_INTEGER_POLICY.
 *   Language-neutral { key, vars } prompt; vars carry the two addends
 *   (a, b) — never the sum (that would give the answer away).
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys.
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. Steps are ordered sub-answers,
 *   not 'correct/wrong' verdicts (that is stage-03's concern).
 *
 * CHOICE INPUT MODE NOTE:
 *   For band 1 (pictorial → 'choice'), the step still emits a single integer
 *   expected; choice-option construction (distractors) is a presentation/widget-
 *   config concern (stage 06). The generator emits only the canonical step + vars.
 *
 * LINT:
 *   All randomness is drawn through the `rng` parameter.
 *   `Math.random` is banned in src/core/** by the no-adhoc-number-format rule.
 */

import type { Generator, GeneratedTask, DifficultyParams, Band, SeededRng, Step } from '@/core/types';
import { canonicalize, SCALAR_INTEGER_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (addition-within-20 specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for addition-within-20.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface AdditionWithin20BandParams {
  /** Maximum value for the sum (inclusive). Positive integer, >= 2. */
  readonly maxTotal: number;
}

/**
 * Narrow `band.params` to `AdditionWithin20BandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): AdditionWithin20BandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).maxTotal !== 'number'
  ) {
    throw new Error(
      '[addition-within-20] Band params have unexpected shape. ' +
        'Expected { maxTotal: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as AdditionWithin20BandParams;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface AdditionWithin20ConcreteParams {
  /** First addend (always known after construction). */
  readonly a: number;
  /** Second addend (always known after construction). */
  readonly b: number;
  /** The sum: a + b (the pre-chosen answer). */
  readonly sum: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): AdditionWithin20ConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws the SUM
 * (the answer) FIRST from `rng` (backward generation), then splits it into
 * two positive-integer addends. Both addends are known before the problem
 * is constructed.
 *
 * Backward generation guarantee: the answer (the sum) is chosen before the
 * problem is stated. This makes it impossible to produce an ill-formed problem.
 *
 * Construction invariant: sum === a + b, a >= 1, b >= 1, 2 <= sum <= maxTotal.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer value.
 */
function instantiate(band: Band, rng: SeededRng): AdditionWithin20ConcreteParams {
  const p = narrowBandParams(band.params);

  // Draw the sum FIRST (the answer) from [2, maxTotal] — 2 is the smallest
  // possible sum of two positive integer addends (1 + 1).
  const sum = rng.nextInt(2, p.maxTotal);
  // Split the sum into two positive-integer addends: a from [1, sum-1], b = sum - a.
  const a = rng.nextInt(1, sum - 1);
  // Derive b from the drawn sum and a (backward construction: answer is known first).
  const b = sum - a;

  return {
    a,
    b,
    sum,
    representationLevel: band.representationLevel,
  };
}

// ---------------------------------------------------------------------------
// generate — builds the full GeneratedTask from concrete params
// ---------------------------------------------------------------------------

/**
 * generate(difficulty, rng): GeneratedTask
 *
 * Produces a complete `GeneratedTask` from the given `DifficultyParams` and RNG.
 *
 * Single step emitted:
 *   - expected = canonicalize(sum) for the pre-chosen sum.
 *   - normalizationPolicy = SCALAR_INTEGER_POLICY.
 *   - inputMode derived from representationLevel:
 *       concrete   → 'manipulative' (countable manipulatives diagram)
 *       pictorial  → 'choice'       (multiple-choice options, stage-06 constructs)
 *       abstract   → 'number'       (free keypad entry)
 *   - prompt.vars carry the two addends (a, b) — never the sum.
 *   - solution === steps[0].expected (single-step task).
 *
 * BYTE REPRODUCIBILITY:
 *   same `difficulty` + same `rng` seed → identical `GeneratedTask`.
 *   All randomness flows through `rng`; no Date.now(), no Math.random().
 */
function generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
  // Build a temporary Band from the difficulty envelope's params and representationLevel.
  const bandFromDifficulty: Band = {
    minCoordinate: 0, // not needed for instantiate — only params and representationLevel matter.
    representationLevel: difficulty.representationLevel,
    params: difficulty.params,
  };

  // Materialize concrete values (backward generation: answer chosen first).
  const concrete = instantiate(bandFromDifficulty, rng);

  // Derive inputMode from representationLevel (CPA-floor + lightest-input ladder).
  // concrete   → 'manipulative' (countable manipulatives; stage-06 renders the full widget)
  // pictorial  → 'choice'       (options synthesized by stage-06; generator emits step only)
  // abstract   → 'number'       (free keypad entry)
  let inputMode: 'manipulative' | 'choice' | 'number';
  if (concrete.representationLevel === 'concrete') {
    inputMode = 'manipulative';
  } else if (concrete.representationLevel === 'pictorial') {
    inputMode = 'choice';
  } else {
    inputMode = 'number';
  }

  // Build the single integer step.
  const step: Step = {
    prompt: {
      key: 'addition_20.step.sum',
      // vars carry the two addends only (never the sum — that would give it away).
      vars: { a: concrete.a, b: concrete.b },
    },
    inputMode,
    // expected is the canonical string of the pre-chosen answer (backward construction).
    expected: canonicalize(concrete.sum),
    skillNode: 'addition-within-20',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution === steps[0].expected for a single-step task.
  const solution = canonicalize(concrete.sum);

  // Build the language-neutral problem prompt.
  // vars carry ONLY the two addends — never the sum (leaking the answer into
  // the problem prompt would give it away). The presentation layer renders
  // "a + b = ?" from these two values.
  return {
    problem: {
      prompt: {
        key: 'addition_20.problem',
        vars: { a: concrete.a, b: concrete.b },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [step],
    representation: concrete.representationLevel,
    skillNode: 'addition-within-20',
  };
}

// ---------------------------------------------------------------------------
// The addition-within-20 Generator implementation
// ---------------------------------------------------------------------------

/**
 * additionWithin20 — the `Generator` implementation for the
 * 'addition-within-20' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key
 * `'addition-within-20'` (integrator responsibility — this file only
 * implements the contract; wiring into the registry/graph is out of scope
 * here).
 */
export const additionWithin20: Generator = {
  skillNode: 'addition-within-20',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
