/**
 * unknown-as-missing-addend.ts — The unknown-as-missing-addend generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * MISSING-ADDEND CONCEPT (the first bridge to algebra):
 *   The equation a + ▢ = c hides the second addend behind a box. Unlike
 *   number-bonds (a purely additive-decomposition model), this generator
 *   presents the task in explicit equation form — the pictorial/abstract
 *   precursor to solving `a + x = c` for `x`. The learner supplies the
 *   missing addend `x`; `a` and `c` are shown.
 *
 * BAND PARAMS (`params: { maxTotal: number }`):
 *   - maxTotal: the maximum value for the total `c` (inclusive upper bound).
 *
 * BACKWARD CONSTRUCTION ORDER:
 *   1. Draw the missing addend `x` (the answer) from [1, maxTotal - 1].
 *      (Reserving at least 1 for `a` guarantees `a` has room to be >= 1.)
 *   2. Draw the known addend `a` from [1, maxTotal - x].
 *   3. Derive the total `c = a + x` (always known after construction).
 *
 * CPA LADDER (shipped defaults, pedagogy-pass calibrates later):
 *   Band 0 concrete  [0.0, 0.4) → 'manipulative' inputMode
 *   Band 1 pictorial [0.4, 0.7) → 'choice' inputMode (multiple choice options)
 *   Band 2 abstract  [0.7, 1.0+) → 'number' inputMode (free keypad entry)
 *
 * STEPS:
 *   A single integer step — the missing addend `x`.
 *   step.expected = canonicalize(x) via SCALAR_INTEGER_POLICY.
 *   Language-neutral { key, vars } prompt; vars carry `a` and `c` only
 *   (the two KNOWN values) — never the answer `x`.
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys.
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. The step is an ordered
 *   sub-answer, not a 'correct/wrong' verdict (that is stage-03's concern).
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
// Band params shape (unknown-as-missing-addend specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for unknown-as-missing-addend.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface MissingAddendBandParams {
  /** Maximum value for the total `c` (inclusive). Positive integer >= 2. */
  readonly maxTotal: number;
}

/**
 * Narrow `band.params` to `MissingAddendBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): MissingAddendBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).maxTotal !== 'number'
  ) {
    throw new Error(
      '[unknown-as-missing-addend] Band params have unexpected shape. ' +
        'Expected { maxTotal: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as MissingAddendBandParams;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface MissingAddendConcreteParams {
  /** The known addend `a` (always shown to the learner). */
  readonly a: number;
  /** The missing addend `x` (the answer the learner must supply). */
  readonly x: number;
  /** The total `c`: a + x (always known after construction; always shown). */
  readonly c: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): MissingAddendConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws the
 * answer `x` FIRST (backward generation), then `a`, deriving `c` last.
 * All three values (a, x, c) are known before the problem is constructed.
 *
 * Backward generation guarantee: the answer is chosen before the problem is
 * stated. This makes it impossible to produce an ill-formed problem.
 *
 * Construction invariant: c === a + x, all positive integers, 1 <= x <=
 * maxTotal - 1, 1 <= a <= maxTotal - x, c <= maxTotal.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer value.
 */
function instantiate(band: Band, rng: SeededRng): MissingAddendConcreteParams {
  const p = narrowBandParams(band.params);

  // Draw x (the missing addend / answer) FIRST from [1, maxTotal - 1] so
  // there is always room for `a` to be drawn >= 1 (backward construction:
  // the answer is chosen before the problem is stated).
  const x = rng.nextInt(1, p.maxTotal - 1);
  // Draw the known addend `a` from [1, maxTotal - x] ensuring c <= maxTotal.
  const a = rng.nextInt(1, p.maxTotal - x);
  // Derive the total from the drawn values.
  const c = a + x;

  return {
    a,
    x,
    c,
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
 *   - expected = canonicalize(x) — the pre-chosen missing addend.
 *   - normalizationPolicy = SCALAR_INTEGER_POLICY.
 *   - inputMode derived from representationLevel:
 *       concrete   → 'manipulative'
 *       pictorial  → 'choice'       (multiple-choice options, stage-06 constructs)
 *       abstract   → 'number'       (free keypad entry)
 *   - prompt.vars carry `a` and `c` (the two KNOWN values), never `x`.
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
  // concrete   → 'manipulative' (stage-06 renders the full widget)
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

  // Build the single integer step. vars carry the two KNOWN values (a, c)
  // only — never the answer x (that would give it away).
  const step: Step = {
    prompt: {
      key: 'missing_addend.step.addend',
      vars: { a: concrete.a, c: concrete.c },
    },
    inputMode,
    // expected is the canonical string of the pre-chosen answer (backward construction).
    expected: canonicalize(concrete.x),
    skillNode: 'unknown-as-missing-addend',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution === steps[0].expected for a single-step task.
  const solution = canonicalize(concrete.x);

  // Build the language-neutral problem prompt. vars carry ONLY the two
  // KNOWN values (a, c) — never the answer x (leaking it would give the
  // answer away). The presentation layer renders the equation as
  // "a + ▢ = c" using these two vars.
  return {
    problem: {
      prompt: {
        key: 'missing_addend.problem',
        vars: { a: concrete.a, c: concrete.c },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [step],
    representation: concrete.representationLevel,
    skillNode: 'unknown-as-missing-addend',
  };
}

// ---------------------------------------------------------------------------
// The unknown-as-missing-addend Generator implementation
// ---------------------------------------------------------------------------

/**
 * unknownAsMissingAddend — the `Generator` implementation for the
 * 'unknown-as-missing-addend' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key
 * `'unknown-as-missing-addend'` (when the graph node is also added). The
 * registry's `assertEveryGeneratorHasNode` verifies this key matches a
 * graph node.
 */
export const unknownAsMissingAddend: Generator = {
  skillNode: 'unknown-as-missing-addend',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
