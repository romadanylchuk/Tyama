/**
 * place-value.ts — The place-value generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * PLACE-VALUE CONCEPT:
 *   Decompose a two-digit number `n` into tens and ones (47 = 4 tens + 7 ones).
 *   Backward construction: draw the tens digit `t` and the ones digit `o`
 *   FIRST (both are answers), then derive `n = 10 * t + o`. This guarantees
 *   the decomposition is always exact and the problem is always well-formed.
 *
 * BAND PARAMS (`params: { maxTens: number }`):
 *   - maxTens: the maximum value for the tens digit (inclusive upper bound,
 *     drawn from [1, maxTens]). The ones digit is always drawn from [0, 9]
 *     (a full digit range — every ones value is a valid decomposition).
 *
 * STEPS (two, in solving order):
 *   Step 1 asks for the tens digit `t` (expected = canonicalize(t)).
 *   Step 2 asks for the ones digit `o` (expected = canonicalize(o)).
 *   Both prompts carry vars `{ n }` only — never the answer being asked for,
 *   and never the OTHER digit (that would leak part of the decomposition).
 *   Each step carries a short recap label so the presentation layer can show
 *   the already-solved tens digit (e.g. "4 = 🔟") while the learner works the
 *   ones digit.
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and each step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys.
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. Steps are ordered sub-answers,
 *   not "correct/wrong" verdicts (that is stage-03's concern).
 *
 * INPUT MODE LADDER:
 *   concrete → 'tokens' (assemble the digit from a token/place-value palette),
 *   pictorial/abstract → 'number' (free keypad entry for the digit).
 *
 * LINT:
 *   All randomness is drawn through the `rng` parameter.
 *   `Math.random` is banned in src/core/** by the no-adhoc-number-format rule.
 */

import type { Generator, GeneratedTask, DifficultyParams, Band, SeededRng, Step } from '@/core/types';
import { canonicalize, SCALAR_INTEGER_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (place-value specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for place-value.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface PlaceValueBandParams {
  /** Maximum value for the tens digit (inclusive). Positive integer, >= 1. */
  readonly maxTens: number;
}

/**
 * Narrow `band.params` to `PlaceValueBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): PlaceValueBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).maxTens !== 'number'
  ) {
    throw new Error(
      '[place-value] Band params have unexpected shape. ' +
        'Expected { maxTens: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as PlaceValueBandParams;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface PlaceValueConcreteParams {
  /** The tens digit (the answer to step 1). */
  readonly tens: number;
  /** The ones digit (the answer to step 2). */
  readonly ones: number;
  /** The full two-digit number: 10 * tens + ones. */
  readonly n: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): PlaceValueConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws the tens
 * digit `t` and the ones digit `o` FIRST from `rng` (backward generation),
 * deriving the full number `n` last. Both digits are known before the
 * problem is constructed.
 *
 * Backward generation guarantee: the answers (tens, ones) are chosen before
 * the problem is stated. This makes it impossible to produce an ill-formed
 * problem.
 *
 * Construction invariant: n === 10 * tens + ones, 1 <= tens <= maxTens,
 * 0 <= ones <= 9.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer values.
 */
function instantiate(band: Band, rng: SeededRng): PlaceValueConcreteParams {
  const p = narrowBandParams(band.params);

  // Draw the tens digit FIRST (an answer) from [1, maxTens].
  const tens = rng.nextInt(1, p.maxTens);
  // Draw the ones digit (the other answer) from the full digit range [0, 9].
  const ones = rng.nextInt(0, 9);
  // Derive the full number from the drawn digits (backward construction: the
  // answers are known first).
  const n = 10 * tens + ones;

  return {
    tens,
    ones,
    n,
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
 * Two ordered steps emitted:
 *   Step 1 — the tens digit: expected = canonicalize(tens).
 *   Step 2 — the ones digit: expected = canonicalize(ones).
 *   Both steps carry SCALAR_INTEGER_POLICY.
 *   inputMode derived from representationLevel:
 *     concrete            → 'tokens'  (assemble the digit from a token palette)
 *     pictorial/abstract  → 'number'  (free keypad entry)
 *   Both prompts carry vars `{ n }` only — never either digit's answer value.
 *   solution === canonicalize(n) (the whole decomposed number).
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

  // Materialize concrete values (backward generation: answers chosen first).
  const concrete = instantiate(bandFromDifficulty, rng);

  // Derive inputMode from representationLevel (CPA-floor + lightest-input ladder).
  // concrete           → 'tokens' (digit assembly from a place-value token palette)
  // pictorial/abstract → 'number' (free keypad entry)
  const inputMode: 'tokens' | 'number' =
    concrete.representationLevel === 'concrete' ? 'tokens' : 'number';

  // Build the two ordered digit steps. vars carry ONLY `n` — never either
  // digit's answer value (that would give it away).
  const tensStep: Step = {
    prompt: {
      key: 'place_value.step.tens',
      vars: { n: concrete.n },
    },
    // recap: a short label so a later step (ones) can show the already-solved
    // tens digit while the learner works the ones digit.
    recap: { key: 'place_value.recap.tens' },
    inputMode,
    // expected is the canonical string of the pre-chosen tens digit (backward construction).
    expected: canonicalize(concrete.tens),
    skillNode: 'place-value',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  const onesStep: Step = {
    prompt: {
      key: 'place_value.step.ones',
      vars: { n: concrete.n },
    },
    recap: { key: 'place_value.recap.ones' },
    inputMode,
    // expected is the canonical string of the pre-chosen ones digit (backward construction).
    expected: canonicalize(concrete.ones),
    skillNode: 'place-value',
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution = the canonical whole number being decomposed (used only as
  // `correctAnswer` in the explanation context; the checker verifies each
  // step against step.expected, not this field).
  const solution = canonicalize(concrete.n);

  // Build the language-neutral problem prompt. vars carry ONLY `n` — the
  // presentation layer renders the "decompose n into tens and ones" prompt
  // from this single value.
  return {
    problem: {
      prompt: {
        key: 'place_value.problem',
        vars: { n: concrete.n },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [tensStep, onesStep],
    representation: concrete.representationLevel,
    skillNode: 'place-value',
  };
}

// ---------------------------------------------------------------------------
// The place-value Generator implementation
// ---------------------------------------------------------------------------

/**
 * placeValue — the `Generator` implementation for the 'place-value' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key `'place-value'`
 * (integrator responsibility — this file only implements the contract;
 * wiring into the registry/graph is out of scope here).
 */
export const placeValue: Generator = {
  skillNode: 'place-value',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
