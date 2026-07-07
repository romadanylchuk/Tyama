/**
 * word-problems.ts — The word-problems generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * WORD-PROBLEMS CONCEPT — a two-step money word problem:
 *   Buy `k` items costing `p` each, pay with `m`. The learner first computes
 *   the total cost (k * p), then the change received (m - total).
 *
 *   Buy 3 items at 4 each, pay with 15:
 *     step 1: total  = 3 * 4  = 12
 *     step 2: change = 15 - 12 = 3
 *
 * BAND PARAMS (`params: { maxItems: number; maxPrice: number }`):
 *   - maxItems: the maximum number of items purchased (inclusive upper bound, >= 2).
 *   - maxPrice: the maximum per-item price (inclusive upper bound, >= 2).
 *
 * BACKWARD CONSTRUCTION ORDER (draw the answers FIRST):
 *   1. Draw the item count `k` from [2, maxItems].
 *   2. Draw the per-item price `p` from [2, maxPrice].
 *   3. Derive `total = k * p` (the answer to step 1).
 *   4. Draw the change `x` from [1, 10] (the answer to step 2).
 *   5. Derive the payment `m = total + x` (always known after construction,
 *      and always >= total so the change is never negative).
 *
 * STEPS (two, in solving order):
 *   Step 1 — total cost: expected = canonicalize(total) via SCALAR_INTEGER_POLICY.
 *     Carries a `recap` label so a later step (change) can show the already-
 *     solved total while the learner works on it (e.g. "💰 = 12").
 *   Step 2 — change: expected = canonicalize(x) via SCALAR_INTEGER_POLICY.
 *     No recap needed — it is the last step in the chain.
 *
 * MONEY UNIT NOTE:
 *   The money unit (currency symbol, "coins", etc.) is a presentation concern.
 *   The core never emits a currency symbol — only { key, vars } LocalizedRefs
 *   with plain numeric vars. The presentation layer decides how to render them.
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and each step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys and
 *   renders the actual word problem from the numeric vars.
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. Steps are ordered sub-answers,
 *   not "correct/wrong" verdicts (that is stage-03's concern).
 *
 * LINT:
 *   All randomness is drawn through the `rng` parameter.
 *   `Math.random` is banned in src/core/** by the no-adhoc-number-format rule.
 */

import type { Generator, GeneratedTask, DifficultyParams, Band, SeededRng, Step } from '@/core/types';
import { canonicalize, SCALAR_INTEGER_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (word-problems specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for word-problems.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface WordProblemsBandParams {
  /** Maximum number of items purchased (inclusive). Integer >= 2. */
  readonly maxItems: number;
  /** Maximum per-item price (inclusive). Integer >= 2. */
  readonly maxPrice: number;
}

/**
 * Narrow `band.params` to `WordProblemsBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): WordProblemsBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).maxItems !== 'number' ||
    typeof (params as Record<string, unknown>).maxPrice !== 'number'
  ) {
    throw new Error(
      '[word-problems] Band params have unexpected shape. ' +
        'Expected { maxItems: number; maxPrice: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as WordProblemsBandParams;
}

// ---------------------------------------------------------------------------
// Change draw range — fixed across bands (not band-dependent).
// ---------------------------------------------------------------------------

const MIN_CHANGE = 1;
const MAX_CHANGE = 10;

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface WordProblemsConcreteParams {
  /** Number of items purchased. */
  readonly k: number;
  /** Per-item price. */
  readonly p: number;
  /** Total cost: k * p (the answer to step 1). */
  readonly total: number;
  /** Change received: m - total (the answer to step 2). */
  readonly x: number;
  /** Amount paid: total + x (always known after construction). */
  readonly m: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): WordProblemsConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws the
 * ANSWERS FIRST from `rng` (backward generation): the item count `k`, the
 * per-item price `p` (from which the total — step 1's answer — is derived),
 * then the change `x` (step 2's answer), from which the payment `m` is
 * derived last. All values are known before the problem is constructed.
 *
 * Backward generation guarantee: both step answers are chosen before the
 * problem is stated. This makes it impossible to produce an ill-formed
 * problem or a negative change.
 *
 * Construction invariant: total === k * p, m === total + x,
 * 2 <= k <= maxItems, 2 <= p <= maxPrice, 1 <= x <= 10.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer values.
 */
function instantiate(band: Band, rng: SeededRng): WordProblemsConcreteParams {
  const p_ = narrowBandParams(band.params);

  // Draw the item count and per-item price FIRST (backward generation).
  const k = rng.nextInt(2, p_.maxItems);
  const p = rng.nextInt(2, p_.maxPrice);
  // Derive the total (step 1's answer) from the drawn values.
  const total = k * p;

  // Draw the change (step 2's answer) FIRST from a fixed range, then derive
  // the payment last — guarantees the payment always covers the total.
  const x = rng.nextInt(MIN_CHANGE, MAX_CHANGE);
  const m = total + x;

  return {
    k,
    p,
    total,
    x,
    m,
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
 *   1. total  — expected = canonicalize(total); carries a `recap` label so
 *      the presentation layer can show the solved total while the learner
 *      works on the change (step 2).
 *   2. change — expected = canonicalize(x); no recap (last step).
 *
 * Both steps use `inputMode: 'number'` regardless of representation level —
 * this generator is abstract-only at the input level for the MVP.
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

  // Materialize concrete values (backward generation: both answers chosen first).
  const concrete = instantiate(bandFromDifficulty, rng);

  // Step 1: total cost. vars carry k and p (the two known inputs), never the total.
  const totalStep: Step = {
    prompt: {
      key: 'word_problems.step.total',
      vars: { k: concrete.k, p: concrete.p },
    },
    // recap: a short label so the presentation layer can recap the solved
    // total (e.g. "💰 = 12") while the learner answers the change step.
    recap: { key: 'word_problems.recap.total' },
    inputMode: 'number',
    // expected is the canonical string of the pre-chosen total (backward construction).
    expected: canonicalize(concrete.total),
    skillNode: 'word-problems',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // Step 2: change. vars carry m (the known payment), never the total or the change.
  const changeStep: Step = {
    prompt: {
      key: 'word_problems.step.change',
      vars: { m: concrete.m },
    },
    inputMode: 'number',
    // expected is the canonical string of the pre-chosen change (backward construction).
    expected: canonicalize(concrete.x),
    skillNode: 'word-problems',
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution === the final step's expected — the real-world answer to the
  // word problem ("how much change do you get back?").
  const solution = canonicalize(concrete.x);

  // Build the language-neutral problem prompt. vars carry k, p, m — the three
  // KNOWN quantities the problem states — never the total or the change
  // (leaking either would give a step's answer away).
  return {
    problem: {
      prompt: {
        key: 'word_problems.problem',
        vars: { k: concrete.k, p: concrete.p, m: concrete.m },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [totalStep, changeStep],
    representation: concrete.representationLevel,
    skillNode: 'word-problems',
  };
}

// ---------------------------------------------------------------------------
// The word-problems Generator implementation
// ---------------------------------------------------------------------------

/**
 * wordProblems — the `Generator` implementation for the 'word-problems' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key `'word-problems'`
 * (when the graph node is also added). The registry's
 * `assertEveryGeneratorHasNode` verifies this key matches a graph node.
 */
export const wordProblems: Generator = {
  skillNode: 'word-problems',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
