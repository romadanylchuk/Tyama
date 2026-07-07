/**
 * decimal-comparison.ts — The decimal-comparison generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - The larger value is chosen FIRST, before the distractor is derived
 *       from it, and before the two candidates are assigned to display
 *       positions — the identical backward-construction discipline every
 *       other generator in this directory follows.
 *
 * DECIMAL-COMPARISON CONCEPT (the 'compare' interaction, Stage 03):
 *   The learner is shown two decimal numbers side by side and must tap the
 *   larger one. Unlike every other MVP generator, BOTH candidate values are
 *   necessarily visible to the learner — comparison is meaningless with a
 *   hidden operand. What varies per seed (and therefore carries the actual
 *   "answer" signal) is WHICH DISPLAY POSITION ('left' or 'right') holds the
 *   larger value — never a fixed position. `step.expected` is the canonical
 *   form of the larger value itself; the checking pipeline compares whatever
 *   locale-formatted string the learner tapped (parsed + canonicalized)
 *   against it, so tapping the larger option always matches regardless of
 *   which position it was rendered in.
 *
 * THE CLASSIC MISCONCEPTION (why the distractor has MORE digits but is
 * SMALLER):
 *   Many learners compare decimals by treating the fractional part as if it
 *   were a plain integer (reading '3.45' as "forty-five" vs '3.5' as "five"
 *   and concluding 3.45 > 3.5). The distractor is deliberately constructed to
 *   exercise exactly this misconception: the larger value has ONE decimal
 *   place (a tenths digit only); the smaller distractor has TWO decimal
 *   places (tenths AND hundredths) yet is always numerically smaller.
 *
 * BAND PARAMS (`params: { maxWhole: number }`):
 *   - maxWhole: the maximum value for the whole-number part (inclusive
 *     upper bound; both candidates share the same whole part).
 *
 * BACKWARD CONSTRUCTION ORDER (integer arithmetic in hundredths units;
 * exactly ONE division at the very end per value — mirrors
 * `canonicalize()`'s own documented shortest-round-trip `toString()`
 * strategy, so `canonicalize(larger)` always yields the intended one-decimal
 * string and `canonicalize(smaller)` always yields the intended two-decimal
 * string):
 *   1. Draw `whole` (the shared whole-number part) from [0, maxWhole].
 *   2. Draw `tenths` (the larger value's tenths digit, the ANSWER's shape)
 *      from [1, 9] — nonzero so the larger value always has a genuine
 *      tenths digit (never collapses to a bare integer).
 *   3. Draw `hundredths` (the distractor's hundredths digit) from [1, 9] —
 *      nonzero so the distractor always has a genuine two-decimal-place
 *      form (never trailing-zero-strips back down to one decimal place).
 *   4. `larger    = (whole*100 + tenths*10) / 100`
 *      `smaller   = (whole*100 + (tenths-1)*10 + hundredths) / 100`
 *      Invariant: smaller < larger for all tenths in [1,9], hundredths in
 *      [1,9] (largerHundredths - smallerHundredths = 10 - hundredths, and
 *      hundredths <= 9 < 10, so the difference is always >= 1).
 *   5. Draw `largerIsLeft` (the answer's DISPLAY POSITION) from {0,1} —
 *      this is what "answer position varies by seed" means: the same
 *      `larger`/`smaller` pair can render on either side across seeds.
 *
 * STEPS:
 *   A single decimal step — canonicalize(larger) via SCALAR_DECIMAL_POLICY.
 *   Language-neutral { key, vars } prompt; vars carry BOTH displayed
 *   candidates (`left`, `right`) — carrying the answer's numeric VALUE is
 *   unavoidable here (the learner must see both numbers to compare them);
 *   what is never leaked is which SIDE holds it (that varies per seed, per
 *   construction step 5 above).
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and step.prompt are LocalizedRef ({ key, vars }) — never
 *   raw localized strings. The presentation layer resolves keys and formats
 *   `left`/`right` per the active locale's decimal separator (never here —
 *   see `src/ui/task-screen/build-widget-config.ts`'s 'compare' branch).
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. The step is an ordered
 *   sub-answer, not a 'correct/wrong' verdict (that is stage-03's concern).
 *
 * COMPARE INPUT MODE:
 *   Always 'compare' regardless of representationLevel — unlike the CPA
 *   ladder generators, this generator's whole purpose IS the 'compare'
 *   interaction; there is no manipulative/choice/number fallback shape for
 *   "which of these two decimals is larger."
 *
 * LINT:
 *   All randomness is drawn through the `rng` parameter.
 *   `Math.random` is banned in src/core/** by the no-adhoc-number-format rule.
 */

import type { Generator, GeneratedTask, DifficultyParams, Band, SeededRng, Step } from '@/core/types';
import { canonicalize, SCALAR_DECIMAL_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (decimal-comparison specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for decimal-comparison.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface DecimalComparisonBandParams {
  /** Maximum value for the shared whole-number part (inclusive). Non-negative integer. */
  readonly maxWhole: number;
}

/**
 * Narrow `band.params` to `DecimalComparisonBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): DecimalComparisonBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).maxWhole !== 'number'
  ) {
    throw new Error(
      '[decimal-comparison] Band params have unexpected shape. ' +
        'Expected { maxWhole: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as DecimalComparisonBandParams;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface DecimalComparisonConcreteParams {
  /** The larger value (the answer). One decimal place. */
  readonly larger: number;
  /** The smaller distractor. Two decimal places; always < larger. */
  readonly smaller: number;
  /** The value shown on the 'left' display slot. */
  readonly left: number;
  /** The value shown on the 'right' display slot. */
  readonly right: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): DecimalComparisonConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws the
 * larger value (the answer) FIRST, derives the smaller distractor from it,
 * then draws the display-position assignment LAST (backward generation: the
 * answer's VALUE is chosen before its DISPLAY POSITION is decided).
 *
 * Construction invariant: smaller < larger always; larger has exactly one
 * decimal place, smaller has exactly two.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer value.
 */
function instantiate(band: Band, rng: SeededRng): DecimalComparisonConcreteParams {
  const p = narrowBandParams(band.params);

  // Draw the shared whole-number part.
  const whole = rng.nextInt(0, p.maxWhole);
  // Draw the larger value's tenths digit (nonzero — a genuine one-decimal value).
  const tenths = rng.nextInt(1, 9);
  // Draw the distractor's hundredths digit (nonzero — a genuine two-decimal value).
  const hundredths = rng.nextInt(1, 9);

  // Integer arithmetic in hundredths units; ONE division per value at the end
  // (mirrors canonicalize()'s documented shortest-round-trip toString() strategy).
  const largerHundredths = whole * 100 + tenths * 10;
  const smallerHundredths = whole * 100 + (tenths - 1) * 10 + hundredths;
  const larger = largerHundredths / 100;
  const smaller = smallerHundredths / 100;

  // Draw the ANSWER's display position LAST — the same (larger, smaller) pair
  // renders on either side across seeds ("answer position varies by seed").
  const largerIsLeft = rng.nextInt(0, 1) === 0;

  return {
    larger,
    smaller,
    left: largerIsLeft ? larger : smaller,
    right: largerIsLeft ? smaller : larger,
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
 *   - expected = canonicalize(larger) — the pre-chosen larger value.
 *   - normalizationPolicy = SCALAR_DECIMAL_POLICY.
 *   - inputMode = 'compare' always (this generator's whole purpose is the
 *     'compare' interaction; there is no CPA-ladder fallback shape).
 *   - prompt.vars carry BOTH displayed candidates (`left`, `right`).
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

  // Build the single decimal step. vars carry BOTH displayed candidates —
  // the learner must see both numbers to compare them; only the SIDE that
  // holds the larger value varies per seed (never a fixed position).
  const step: Step = {
    prompt: {
      key: 'decimal_compare.step.larger',
      vars: { left: concrete.left, right: concrete.right },
    },
    inputMode: 'compare',
    // expected is the canonical string of the pre-chosen larger value.
    expected: canonicalize(concrete.larger),
    skillNode: 'decimal-comparison',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_DECIMAL_POLICY,
  } satisfies Step;

  // solution === steps[0].expected for a single-step task.
  const solution = canonicalize(concrete.larger);

  // Build the language-neutral problem prompt. vars carry the same left/right
  // pair as the step — the presentation layer renders both locale-formatted
  // values side by side via the 'compare' widget config.
  return {
    problem: {
      prompt: {
        key: 'decimal_compare.problem',
        vars: { left: concrete.left, right: concrete.right },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [step],
    representation: concrete.representationLevel,
    skillNode: 'decimal-comparison',
  };
}

// ---------------------------------------------------------------------------
// The decimal-comparison Generator implementation
// ---------------------------------------------------------------------------

/**
 * decimalComparison — the `Generator` implementation for the
 * 'decimal-comparison' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key
 * `'decimal-comparison'` (when the graph node is also added — integrator
 * responsibility; this file only implements the contract).
 */
export const decimalComparison: Generator = {
  skillNode: 'decimal-comparison',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
