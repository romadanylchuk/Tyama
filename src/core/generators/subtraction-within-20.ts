/**
 * subtraction-within-20.ts — The subtraction-within-20 generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * SUBTRACTION-WITHIN-20 CONCEPT:
 *   A simple subtraction fact: m - s = d. The learner is shown the minuend
 *   (m) and the subtrahend (s) and must supply the difference (d).
 *   Backward construction: draw the DIFFERENCE first (the answer), then draw
 *   the subtrahend, then derive the minuend: m = s + d. This mirrors
 *   addition-within-20's shape but inverted — subtraction-within-20 always
 *   asks for the difference, never the minuend or subtrahend.
 *
 * BAND PARAMS (`params: { maxTotal: number }`):
 *   - maxTotal: the maximum value for the minuend (inclusive upper bound).
 *     Draw the difference d first from [1, maxTotal - 1] (1 is the smallest
 *     possible positive difference; maxTotal - 1 leaves room for a
 *     subtrahend >= 1), then draw the subtrahend s from [1, maxTotal - d]
 *     (so that m = s + d never exceeds maxTotal), then derive the minuend
 *     m = s + d.
 *
 * CPA LADDER (shipped defaults, pedagogy-pass calibrates later):
 *   Band 0 concrete  [0.0, 0.4) → maxTotal 10 → 'manipulative' inputMode
 *   Band 1 pictorial [0.4, 0.7) → maxTotal 15 → 'choice' inputMode
 *   Band 2 abstract  [0.7, 1.0+) → maxTotal 20 → 'number' inputMode
 *
 * STEPS:
 *   A single integer step — the difference.
 *   step.expected = canonicalize(d) via SCALAR_INTEGER_POLICY.
 *   Language-neutral { key, vars } prompt; vars carry the minuend and
 *   subtrahend (m, s) — never the difference (that would give the answer away).
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
// Band params shape (subtraction-within-20 specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for subtraction-within-20.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface SubtractionWithin20BandParams {
  /** Maximum value for the minuend (inclusive). Positive integer, >= 2. */
  readonly maxTotal: number;
}

/**
 * Narrow `band.params` to `SubtractionWithin20BandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): SubtractionWithin20BandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).maxTotal !== 'number'
  ) {
    throw new Error(
      '[subtraction-within-20] Band params have unexpected shape. ' +
        'Expected { maxTotal: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as SubtractionWithin20BandParams;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface SubtractionWithin20ConcreteParams {
  /** The minuend: s + d (derived after the answer is drawn). */
  readonly m: number;
  /** The subtrahend (drawn after the difference). */
  readonly s: number;
  /** The difference: m - s (the pre-chosen answer). */
  readonly d: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): SubtractionWithin20ConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws the
 * DIFFERENCE (the answer) FIRST from `rng` (backward generation), then draws
 * the subtrahend, then derives the minuend. All three values are known
 * before the problem is constructed.
 *
 * Backward generation guarantee: the answer (the difference) is chosen
 * before the problem is stated. This makes it impossible to produce an
 * ill-formed problem.
 *
 * Construction invariant: d === m - s, s >= 1, d >= 1, m <= maxTotal.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer value.
 */
function instantiate(band: Band, rng: SeededRng): SubtractionWithin20ConcreteParams {
  const p = narrowBandParams(band.params);

  // Draw the difference FIRST (the answer) from [1, maxTotal - 1] — 1 is the
  // smallest possible positive difference, and maxTotal - 1 leaves room for
  // a subtrahend >= 1 while keeping the minuend within maxTotal.
  const d = rng.nextInt(1, p.maxTotal - 1);
  // Draw the subtrahend from [1, maxTotal - d] so that m = s + d <= maxTotal.
  const s = rng.nextInt(1, p.maxTotal - d);
  // Derive the minuend from the drawn difference and subtrahend (backward
  // construction: answer is known first).
  const m = s + d;

  return {
    m,
    s,
    d,
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
 *   - expected = canonicalize(d) for the pre-chosen difference.
 *   - normalizationPolicy = SCALAR_INTEGER_POLICY.
 *   - inputMode derived from representationLevel:
 *       concrete   → 'manipulative' (countable manipulatives diagram)
 *       pictorial  → 'choice'       (multiple-choice options, stage-06 constructs)
 *       abstract   → 'number'       (free keypad entry)
 *   - prompt.vars carry the minuend and subtrahend (m, s) — never the difference.
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
      key: 'subtraction_20.step.difference',
      // vars carry the minuend and subtrahend only (never the difference —
      // that would give it away).
      vars: { m: concrete.m, s: concrete.s },
    },
    inputMode,
    // expected is the canonical string of the pre-chosen answer (backward construction).
    expected: canonicalize(concrete.d),
    skillNode: 'subtraction-within-20',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution === steps[0].expected for a single-step task.
  const solution = canonicalize(concrete.d);

  // Build the language-neutral problem prompt.
  // vars carry ONLY the minuend and subtrahend — never the difference
  // (leaking the answer into the problem prompt would give it away). The
  // presentation layer renders "m - s = ?" from these two values.
  return {
    problem: {
      prompt: {
        key: 'subtraction_20.problem',
        vars: { m: concrete.m, s: concrete.s },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [step],
    representation: concrete.representationLevel,
    skillNode: 'subtraction-within-20',
  };
}

// ---------------------------------------------------------------------------
// The subtraction-within-20 Generator implementation
// ---------------------------------------------------------------------------

/**
 * subtractionWithin20 — the `Generator` implementation for the
 * 'subtraction-within-20' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key
 * `'subtraction-within-20'` (integrator responsibility — this file only
 * implements the contract; wiring into the registry/graph is out of scope
 * here).
 */
export const subtractionWithin20: Generator = {
  skillNode: 'subtraction-within-20',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
