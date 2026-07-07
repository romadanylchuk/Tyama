/**
 * rounding.ts — The rounding-to-nearest-10 generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees a unique, known-correct solution and deterministic
 *   step.expected values (same seed → same task).
 *
 * ROUNDING CONCEPT:
 *   The learner is shown a number `n` and must round it to the nearest 10,
 *   producing `r`. Backward construction: draw the ROUNDED VALUE `r` first
 *   (the answer — always a multiple of 10), then draw a small `offset` and
 *   derive `n = r + offset`. This guarantees `n` rounds unambiguously to `r`
 *   without the generator ever having to perform rounding arithmetic on the
 *   answer path (the answer is chosen, not computed).
 *
 * OFFSET RANGE — DELIBERATE PEDAGOGY SIMPLIFICATION:
 *   offset is drawn from [-4, 4] (0 allowed). +5 / -5 (the round-half-up
 *   boundary, e.g. 25 → nearest 10 is ambiguous/convention-dependent) is
 *   deliberately EXCLUDED so the half-up tie-breaking rule never has to be
 *   taught or assumed at these low bands. This keeps every generated task
 *   unambiguous: exactly one nearest multiple of 10 exists for any n in
 *   [r-4, r+4]. `pedagogy-pass` may introduce a dedicated "round the halfway
 *   case" atom later with an explicit tie-breaking rule; this generator does
 *   not attempt it.
 *
 * BAND PARAMS (`params: { maxBase: number }`):
 *   - maxBase: the maximum multiple-of-10 index. r is drawn from
 *     [10, maxBase * 10] in steps of 10 (i.e. r ∈ {10, 20, ..., maxBase*10}).
 *
 * GUARD:
 *   n must be >= 1 (never present a non-positive or zero problem number).
 *   Because r >= 10 and offset >= -4, n = r + offset >= 6 always — the guard
 *   is defensive/documentation only for this offset range, but is checked
 *   explicitly so the invariant is enforced even if the offset range changes.
 *
 * STEPS:
 *   A single integer step — the rounded value r.
 *   step.expected = canonicalize(r) via SCALAR_INTEGER_POLICY.
 *   Language-neutral { key, vars } prompt; vars carry ONLY `n` (never `r` —
 *   that would give the answer away).
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys.
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. Steps are ordered
 *   sub-answers, not 'correct/wrong' verdicts (that is stage-03's concern).
 *
 * INPUT MODE LADDER (shipped defaults, pedagogy-pass calibrates later):
 *   pictorial → 'choice' (multiple-choice options; stage-06 constructs distractors)
 *   abstract  → 'number' (free keypad entry)
 *   (concrete is not offered for this node in the shipped bands — rounding is
 *   introduced at the pictorial level; the inputMode ladder below still
 *   handles a 'concrete' representationLevel defensively should a future band
 *   introduce it, mapping it to the lightest available input.)
 *
 * LINT:
 *   All randomness is drawn through the `rng` parameter.
 *   `Math.random` is banned in src/core/** by the no-adhoc-number-format rule.
 */

import type { Generator, GeneratedTask, DifficultyParams, Band, SeededRng, Step } from '@/core/types';
import { canonicalize, SCALAR_INTEGER_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (rounding specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for rounding.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface RoundingBandParams {
  /** Maximum multiple-of-10 index. r is drawn from [10, maxBase*10]. Positive integer, >= 1. */
  readonly maxBase: number;
}

/**
 * Narrow `band.params` to `RoundingBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): RoundingBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).maxBase !== 'number'
  ) {
    throw new Error(
      '[rounding] Band params have unexpected shape. ' +
        'Expected { maxBase: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as RoundingBandParams;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface RoundingConcreteParams {
  /** The number to be rounded (n = r + offset). */
  readonly n: number;
  /** The rounded value: the nearest multiple of 10 to n (the pre-chosen answer). */
  readonly r: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): RoundingConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws the
 * ROUNDED VALUE r (the answer) FIRST from `rng` (backward generation) as a
 * multiple of 10, then draws an offset in [-4, 4] (5 excluded — see module
 * doc) and derives n = r + offset.
 *
 * Backward generation guarantee: the answer (r) is chosen before the problem
 * is stated. This makes it impossible to produce an ambiguous problem — n is
 * always strictly closer to r than to any other multiple of 10.
 *
 * Construction invariant: r is a multiple of 10, 10 <= r <= maxBase*10;
 * n = r + offset with offset in [-4, 4]; n >= 1.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer value.
 */
function instantiate(band: Band, rng: SeededRng): RoundingConcreteParams {
  const p = narrowBandParams(band.params);

  // Draw the rounded value r FIRST (the answer) as a multiple of 10 from
  // [10, maxBase*10]. Draw the base index in [1, maxBase] and scale by 10.
  const base = rng.nextInt(1, p.maxBase);
  const r = base * 10;

  // Draw the offset in [-4, 4] (0 allowed; +-5 excluded — see module doc for
  // the deliberate half-up-ambiguity pedagogy simplification).
  const offset = rng.nextInt(-4, 4);

  // Derive n from the drawn r and offset (backward construction: answer is
  // known first).
  const n = r + offset;

  // Guard: n must be >= 1 (never present a non-positive problem number).
  if (n < 1) {
    throw new Error(
      `[rounding] Constructed n=${n} is below the minimum of 1 (r=${r}, offset=${offset}). ` +
        'This should be unreachable given r >= 10 and offset >= -4; band params may be malformed.'
    );
  }

  return {
    n,
    r,
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
 *   - expected = canonicalize(r) for the pre-chosen rounded value.
 *   - normalizationPolicy = SCALAR_INTEGER_POLICY.
 *   - inputMode derived from representationLevel:
 *       pictorial → 'choice'  (multiple-choice options, stage-06 constructs)
 *       abstract  → 'number'  (free keypad entry)
 *       concrete  → 'choice'  (defensive fallback; not offered in shipped bands)
 *   - prompt.vars carry ONLY n — never r.
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

  // Derive inputMode from representationLevel.
  // pictorial → 'choice' (options synthesized by stage-06; generator emits step only)
  // abstract  → 'number' (free keypad entry)
  // concrete  → 'choice' (defensive fallback; rounding is not shipped at concrete level)
  let inputMode: 'choice' | 'number';
  if (concrete.representationLevel === 'abstract') {
    inputMode = 'number';
  } else {
    inputMode = 'choice';
  }

  // Build the single integer step.
  const step: Step = {
    prompt: {
      key: 'rounding.step.rounded',
      // vars carry ONLY n (never r — that would give the answer away).
      vars: { n: concrete.n },
    },
    inputMode,
    // expected is the canonical string of the pre-chosen answer (backward construction).
    expected: canonicalize(concrete.r),
    skillNode: 'rounding',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution === steps[0].expected for a single-step task.
  const solution = canonicalize(concrete.r);

  // Build the language-neutral problem prompt.
  // vars carry ONLY n — never r (leaking the answer into the problem prompt
  // would give it away).
  return {
    problem: {
      prompt: {
        key: 'rounding.problem',
        vars: { n: concrete.n },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [step],
    representation: concrete.representationLevel,
    skillNode: 'rounding',
  };
}

// ---------------------------------------------------------------------------
// The rounding Generator implementation
// ---------------------------------------------------------------------------

/**
 * rounding — the `Generator` implementation for the 'rounding' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key `'rounding'`
 * (integrator responsibility — this file only implements the contract;
 * wiring into the registry/graph is out of scope here).
 */
export const rounding: Generator = {
  skillNode: 'rounding',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
