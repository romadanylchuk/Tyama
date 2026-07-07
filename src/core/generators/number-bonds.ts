/**
 * number-bonds.ts — The number-bonds generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * NUMBER BONDS CONCEPT:
 *   A number bond is a mental arithmetic model showing how a whole splits
 *   into two parts: whole = partA + partB. One of the three values is hidden
 *   (the missingSlot) and the learner must supply it.
 *
 * BAND PARAMS (`params: { wholeMax: number; missingSlot: 'partA' | 'partB' | 'whole' | 'random' }`):
 *   - wholeMax: the maximum value for the whole (inclusive upper bound).
 *   - missingSlot: which of the three values the learner must find.
 *     'partA'  → learner solves for partA.
 *     'partB'  → learner solves for partB.
 *     'whole'  → learner solves for the whole.
 *     'random' → the SLOT itself is drawn per-instance from `rng` (still
 *                backward generation: the slot draw happens alongside the
 *                other pre-answer draws, before the problem is built). The
 *                resolved slot is always one of 'partA' | 'partB' | 'whole'
 *                by the time the `GeneratedTask` is built — 'random' never
 *                appears on `NumberBondsConcreteParams`, `Step`, or in any
 *                i18n key/var (those reuse the existing per-slot keys).
 *
 * CPA LADDER (shipped defaults, pedagogy-pass calibrates later):
 *   Band 0 concrete  [0.00, 0.40) → 'manipulative' inputMode (number-bond diagram)
 *   Band 1 pictorial [0.40, 0.70) → 'choice' inputMode (multiple choice options)
 *   Band 2 abstract  [0.70, 0.85) → 'number' inputMode (free keypad entry)
 *   Band 3 abstract  [0.85, 1.00+) → 'number' inputMode; wholeMax 50, missingSlot
 *                    'random' (larger wholes + per-instance slot variety for
 *                    high-mastery learners — see BAND PARAMS above).
 *
 * STEPS:
 *   A single integer step — the missing value.
 *   step.expected = canonicalize(answerValue) via SCALAR_INTEGER_POLICY.
 *   Language-neutral { key, vars } prompt; vars carry the two KNOWN values only.
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
// Band params shape (number-bonds specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for number-bonds.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface NumberBondsBandParams {
  /** Maximum value for the whole (inclusive). Positive integer. */
  readonly wholeMax: number;
  /**
   * Which of the three values (partA, partB, whole) is the unknown.
   * The learner must supply the value at this slot.
   *
   * 'random' is a per-instance instruction to `instantiate()`: draw the slot
   * itself from `rng` (see `drawMissingSlot`) rather than reading a fixed
   * literal. This lets a single band present slot variety across instances
   * instead of always asking for the same one.
   */
  readonly missingSlot: 'partA' | 'partB' | 'whole' | 'random';
}

/**
 * Narrow `band.params` to `NumberBondsBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): NumberBondsBandParams {
  const missingSlot = (params as Record<string, unknown> | null)?.missingSlot;
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).wholeMax !== 'number' ||
    (missingSlot !== 'partA' &&
      missingSlot !== 'partB' &&
      missingSlot !== 'whole' &&
      missingSlot !== 'random')
  ) {
    throw new Error(
      '[number-bonds] Band params have unexpected shape. ' +
        "Expected { wholeMax: number; missingSlot: 'partA' | 'partB' | 'whole' | 'random' }. " +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as NumberBondsBandParams;
}

/**
 * Resolve a per-instance missing slot when the band asks for `'random'`.
 *
 * Draws a single integer in [0, 2] via `rng.nextInt` (backward generation:
 * this draw happens BEFORE the parts/whole are constructed, alongside the
 * other pre-answer draws) and maps it onto the three slots. Literal-slot
 * bands never call this — they keep their exact existing draw sequence
 * (byte-identical for a fixed seed).
 */
function drawMissingSlot(rng: SeededRng): 'partA' | 'partB' | 'whole' {
  const roll = rng.nextInt(0, 2);
  if (roll === 0) return 'partA';
  if (roll === 1) return 'partB';
  return 'whole';
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface NumberBondsConcreteParams {
  /** Part A of the number bond (always known after construction). */
  readonly partA: number;
  /** Part B of the number bond (always known after construction). */
  readonly partB: number;
  /** The whole value: partA + partB (always known after construction). */
  readonly whole: number;
  /** Which slot the learner must supply. */
  readonly missingSlot: 'partA' | 'partB' | 'whole';
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): NumberBondsConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws concrete
 * values from `rng` FIRST (backward generation). All three values (partA,
 * partB, whole) are known before the problem is constructed.
 *
 * Backward generation guarantee: the answer is chosen before the problem is
 * stated. This makes it impossible to produce an ill-formed problem.
 *
 * Construction invariant: whole === partA + partB, all non-negative integers,
 * 0 <= partA, 1 <= partB, whole <= wholeMax.
 *
 * SLOT VARIETY (`missingSlot: 'random'`): the slot is drawn FIRST, still
 * before the parts/whole are constructed (a pre-answer draw, same spirit as
 * backward generation). Literal-slot bands take zero extra `rng` draws here.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer value.
 */
function instantiate(band: Band, rng: SeededRng): NumberBondsConcreteParams {
  const p = narrowBandParams(band.params);

  // Resolve the missing slot. Only 'random' bands spend an extra rng draw here
  // — existing literal-slot bands are unaffected (no draw-order change, so
  // they stay byte-identical to their pre-existing behaviour for a fixed seed).
  const missingSlot = p.missingSlot === 'random' ? drawMissingSlot(rng) : p.missingSlot;

  // Draw partA from [0, wholeMax-1] so there is always room for partB >= 1.
  const partA = rng.nextInt(0, p.wholeMax - 1);
  // Draw partB from [1, wholeMax - partA] ensuring whole <= wholeMax and partB >= 1.
  const partB = rng.nextInt(1, p.wholeMax - partA);
  // Derive whole from the drawn parts (backward construction: answer is known first).
  const whole = partA + partB;

  return {
    partA,
    partB,
    whole,
    missingSlot,
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
 *   - expected = canonicalize(answerValue) for the missingSlot value.
 *   - normalizationPolicy = SCALAR_INTEGER_POLICY.
 *   - inputMode derived from representationLevel:
 *       concrete   → 'manipulative' (number-bond diagram)
 *       pictorial  → 'choice'       (multiple-choice options, stage-06 constructs)
 *       abstract   → 'number'       (free keypad entry)
 *   - prompt.vars carry the two KNOWN values (never the answer).
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
  const concrete = instantiate(bandFromDifficulty, rng) as NumberBondsConcreteParams;

  // Determine the answer value and the two known values from the missingSlot.
  let answerValue: number;
  let knownA: number;
  let knownB: number;

  if (concrete.missingSlot === 'partA') {
    answerValue = concrete.partA;
    knownA = concrete.partB;
    knownB = concrete.whole;
  } else if (concrete.missingSlot === 'partB') {
    answerValue = concrete.partB;
    knownA = concrete.partA;
    knownB = concrete.whole;
  } else {
    // missingSlot === 'whole'
    answerValue = concrete.whole;
    knownA = concrete.partA;
    knownB = concrete.partB;
  }

  // Derive inputMode from representationLevel (CPA-floor + lightest-input ladder).
  // concrete   → 'manipulative' (number-bond diagram; stage-06 renders the full widget)
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

  // Map camelCase slot names to lowercase i18n key segments.
  // i18n resource keys must be lowercase (no uppercase letters in the key path).
  const slotKey = concrete.missingSlot === 'partA'
    ? 'part_a'
    : concrete.missingSlot === 'partB'
      ? 'part_b'
      : 'whole';

  // Build the single integer step.
  const step: Step = {
    prompt: {
      key: `number_bonds.step.${slotKey}`,
      // vars carry the two KNOWN values only (never the answer — that would give it away).
      vars: { knownA, knownB },
    },
    inputMode,
    // expected is the canonical string of the pre-chosen answer (backward construction).
    expected: canonicalize(answerValue),
    skillNode: 'number-bonds',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution === steps[0].expected for a single-step task.
  const solution = canonicalize(answerValue);

  // Build the language-neutral problem prompt.
  // vars carry ONLY the two KNOWN bond values plus which slot is missing — never
  // the answer value (leaking the missing slot's value into the problem prompt
  // would give the answer away). The presentation layer renders the missing slot
  // as a blank from `missingSlot` (e.g. "whole=?, partA=3, partB=4").
  const problemVars: Record<string, string | number> = {
    knownA,
    knownB,
    missingSlot: concrete.missingSlot,
  };

  return {
    problem: {
      prompt: {
        key: `number_bonds.problem.${slotKey}`,
        vars: problemVars,
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [step],
    representation: concrete.representationLevel,
    skillNode: 'number-bonds',
  };
}

// ---------------------------------------------------------------------------
// The number-bonds Generator implementation
// ---------------------------------------------------------------------------

/**
 * numberBonds — the `Generator` implementation for the 'number-bonds' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key `'number-bonds'`
 * (Phase 7, when the graph node is also added). The registry's
 * `assertEveryGeneratorHasNode` verifies this key matches a graph node.
 */
export const numberBonds: Generator = {
  skillNode: 'number-bonds',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
