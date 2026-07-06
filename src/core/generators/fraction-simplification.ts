/**
 * fraction-simplification.ts — The fraction-simplification generator (D9).
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen reduced fraction p/q drawn
 *   via `rng`. This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * FRACTION SIMPLIFICATION CONCEPT:
 *   The learner is presented an unreduced fraction n/d = (p·k)/(q·k) and must
 *   simplify it to p/q (the reduced form). The answer is decomposed into TWO
 *   ordered integer steps: numerator p first, then denominator q.
 *
 *   Backward construction:
 *     1. Draw q in [2, maxDenominator] — the target denominator (always > 1,
 *        so the result is a true fraction, never collapses to an integer).
 *     2. Draw p in [1, q-1] (proper fraction; p < q for simplicity).
 *        Rejection-sample until gcd(p, q) === 1 (coprime base pair, i.e., p/q
 *        is already in lowest terms).
 *     3. Draw k in [2, maxFactor] — the common factor to scale up.
 *     4. Present n/d = (p·k)/(q·k) to the learner (the unreduced fraction).
 *     5. The learner must supply p (numerator step) then q (denominator step).
 *
 * BAND PARAMS (`params: { maxDenominator: number; maxFactor: number }`):
 *   - maxDenominator: maximum denominator q (inclusive). Draw from [2, maxDenominator].
 *   - maxFactor:      maximum scale factor k (inclusive). Draw from [2, maxFactor].
 *
 * CPA LADDER (shipped defaults, pedagogy-pass calibrates later):
 *   Band 0 concrete  [0.0, 0.4) → 'manipulative' inputMode (fraction-bar model)
 *                                  { maxDenominator: 4, maxFactor: 2 }
 *   Band 1 pictorial [0.4, 0.7) → 'multi-slot'   inputMode
 *                                  { maxDenominator: 8, maxFactor: 3 }
 *   Band 2 abstract  [0.7, 1.0+) → 'multi-slot'  inputMode
 *                                  { maxDenominator: 12, maxFactor: 4 }
 *
 * STEPS (TWO integer steps — NOT a fraction branch in the checker):
 *   Step 0 (numerator):   expected = canonicalize(p), SCALAR_INTEGER_POLICY.
 *   Step 1 (denominator): expected = canonicalize(q), SCALAR_INTEGER_POLICY.
 *   Both use the EXISTING integer path in checkAnswer — D9 does NOT use the
 *   Phase-2 fraction checker branch (two integer steps; each width=1).
 *   This makes D9 robust to D2 regardless.
 *
 * PROVES D1 VIA task.solution:
 *   task.solution = canonicalizeFraction(p, q) — the sole fraction-emission site.
 *   Unit tests assert canonicalizeFraction(p, q) === `${p}/${q}` for the
 *   rejection-sampled coprime pair, AND canonicalizeFraction(p*k, q*k) ===
 *   task.solution (folding the presented unreduced fraction yields the same answer).
 *   If canonicalizeFraction diverged from the spec, these tests fail loudly.
 *
 * GCD NOTE:
 *   A private local Euclid gcd helper is defined here rather than depending on
 *   the canonical module's internal (unexported) gcd. The local copy is small,
 *   self-contained, and keeps this module independently testable.
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and each step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys.
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. Steps are ordered sub-answers,
 *   not 'correct/wrong' verdicts (that is stage-03's concern).
 *
 * LINT:
 *   All randomness is drawn through the `rng` parameter.
 *   `Math.random` is banned in src/core/** by the no-adhoc-number-format rule.
 */

import type { Generator, GeneratedTask, DifficultyParams, Band, SeededRng, Step } from '@/core/types';
import { canonicalize, canonicalizeFraction, SCALAR_INTEGER_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (fraction-simplification specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for fraction-simplification.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface FractionSimplificationBandParams {
  /** Maximum denominator q (inclusive). Draw from [2, maxDenominator]. */
  readonly maxDenominator: number;
  /** Maximum scale factor k (inclusive). Draw from [2, maxFactor]. */
  readonly maxFactor: number;
}

/**
 * Narrow `band.params` to `FractionSimplificationBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): FractionSimplificationBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).maxDenominator !== 'number' ||
    typeof (params as Record<string, unknown>).maxFactor !== 'number'
  ) {
    throw new Error(
      '[fraction-simplification] Band params have unexpected shape. ' +
        'Expected { maxDenominator: number; maxFactor: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as FractionSimplificationBandParams;
}

// ---------------------------------------------------------------------------
// Private GCD helper (local Euclid — canonical module's gcd is unexported)
// ---------------------------------------------------------------------------

/**
 * Pure Euclidean GCD on non-negative integers.
 * gcd(0, n) === n; gcd(a, b) === gcd(b, a % b).
 * Used for the rejection-sampling coprimality check only.
 * All arithmetic is on non-negative integers (absolute values passed by caller).
 */
function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const tmp = y;
    y = x % y;
    x = tmp;
  }
  return x;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 *
 * Invariants (all hold by construction):
 *   - gcd(p, q) === 1 (coprime base pair; rejection sampling ensures this).
 *   - q >= 2 (never collapses to integer; task is always a genuine fraction).
 *   - p >= 1 && p < q (proper fraction; 0 < p/q < 1).
 *   - k >= 2 (task is genuinely non-reduced; presentedNum / presentedDen === p/q
 *     but gcd(presentedNum, presentedDen) === k > 1).
 *   - presentedNum = p * k, presentedDen = q * k.
 */
interface FractionSimplificationConcreteParams {
  /** The reduced numerator (the correct answer for step 0). */
  readonly p: number;
  /** The reduced denominator (the correct answer for step 1). */
  readonly q: number;
  /** The scale factor applied: k >= 2. */
  readonly k: number;
  /** The presented (unreduced) numerator: p * k. */
  readonly presentedNum: number;
  /** The presented (unreduced) denominator: q * k. */
  readonly presentedDen: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): FractionSimplificationConcreteParams
 *
 * Reads the band's `params` to determine the task range, then draws concrete
 * values from `rng` FIRST (backward generation):
 *   1. Draw q in [2, maxDenominator].
 *   2. Draw p in [1, q-1] with rejection until gcd(p, q) === 1.
 *   3. Draw k in [2, maxFactor].
 *   4. Compute presented fraction: n = p*k, d = q*k.
 *
 * The rejection loop is bounded: since q >= 2, there is always at least one
 * valid p in [1, q-1] coprime to q (e.g. p=1 if q is prime, or the first
 * number < q coprime to it in all cases). In practice, the loop terminates
 * in very few iterations (average < 2 for the given band ranges).
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen reduced p/q and scale k.
 */
function instantiate(band: Band, rng: SeededRng): FractionSimplificationConcreteParams {
  const bp = narrowBandParams(band.params);

  // Step 1: Draw the target reduced denominator q in [2, maxDenominator].
  // q >= 2 ensures the result is a proper fraction (never collapses to integer).
  const q = rng.nextInt(2, bp.maxDenominator);

  // Step 2: Rejection-sample a coprime p in [1, q-1].
  // The loop always terminates because at least one valid p exists (q >= 2).
  let p: number;
  do {
    p = rng.nextInt(1, q - 1);
  } while (gcd(p, q) !== 1);

  // Step 3: Draw the scale factor k in [2, maxFactor].
  // k >= 2 ensures the presented fraction is genuinely non-reduced.
  const k = rng.nextInt(2, bp.maxFactor);

  // Step 4: Compute the presented (unreduced) fraction.
  const presentedNum = p * k;
  const presentedDen = q * k;

  return {
    p,
    q,
    k,
    presentedNum,
    presentedDen,
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
 * TWO ordered integer steps:
 *   Step 0 (numerator):   expected = canonicalize(p), SCALAR_INTEGER_POLICY.
 *   Step 1 (denominator): expected = canonicalize(q), SCALAR_INTEGER_POLICY.
 *
 * Both steps use the EXISTING integer checking path (width=1 each) — this
 * generator does NOT use the Phase-2 fraction checker branch. It is robust to
 * D2 by design: two integer steps, two width-1 outputs, no fraction fold needed.
 *
 * task.solution = canonicalizeFraction(p, q) — PROVES D1:
 *   - Since gcd(p, q) === 1 and q >= 2, canonicalizeFraction(p, q) === `${p}/${q}`.
 *   - canonicalizeFraction(p*k, q*k) reduces to the same canonical string.
 *   - Unit tests assert both invariants; if D1 diverges, those tests fail loudly.
 *
 * inputMode per representationLevel (CPA-floor ladder):
 *   concrete   → 'manipulative' (fraction-bar ManipulativeModel; stage-06 renders)
 *   pictorial  → 'multi-slot'   (two integer slots for numerator and denominator)
 *   abstract   → 'multi-slot'   (same, but at speed; elicitFromMastery propagated)
 *
 * For the concrete band, the manipulative model carries the presented fraction
 * so the widget can render the fraction-bar. The step.inputMode is 'manipulative'
 * for both steps at the concrete band (the widget emits two per-slot outputs,
 * positionally aligned to steps[0] and steps[1]).
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

  // Materialize concrete values (backward generation: p/q chosen before problem is stated).
  const concrete = instantiate(bandFromDifficulty, rng) as FractionSimplificationConcreteParams;

  // Derive inputMode from representationLevel (CPA-floor ladder).
  // concrete   → 'manipulative' (fraction-bar diagram; stage-06 renders full interactivity)
  // pictorial  → 'multi-slot'   (two-slot numeric entry; step labels visible)
  // abstract   → 'multi-slot'   (same but at speed; elicitFromMastery drives scaffold fade)
  const inputMode: 'manipulative' | 'multi-slot' =
    concrete.representationLevel === 'concrete' ? 'manipulative' : 'multi-slot';

  // Problem prompt: presents the UNREDUCED fraction n/d (not the answer p/q).
  // vars carry presentedNum and presentedDen so the presentation layer can
  // render e.g. "Simplify 6/8" (where 6=presentedNum, 8=presentedDen).
  const problemPrompt = {
    key: 'fraction_simpl.problem',
    vars: { num: concrete.presentedNum, den: concrete.presentedDen },
  };

  // Step 0: the reduced numerator p.
  // expected = canonicalize(p) — integer scalar via SCALAR_INTEGER_POLICY.
  // prompt.vars carry the full presented fraction so the step label can say
  // "What is the numerator of the simplified form of n/d?"
  const stepNumerator: Step = {
    prompt: {
      key: 'fraction_simpl.step.numerator',
      vars: { num: concrete.presentedNum, den: concrete.presentedDen },
    },
    inputMode,
    expected: canonicalize(concrete.p),
    skillNode: 'fraction-simplification',
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // Step 1: the reduced denominator q.
  // expected = canonicalize(q) — integer scalar via SCALAR_INTEGER_POLICY.
  const stepDenominator: Step = {
    prompt: {
      key: 'fraction_simpl.step.denominator',
      vars: { num: concrete.presentedNum, den: concrete.presentedDen },
    },
    inputMode,
    expected: canonicalize(concrete.q),
    skillNode: 'fraction-simplification',
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // task.solution = canonicalizeFraction(p, q) — the sole fraction-emission site.
  // This PROVES D1: if canonicalizeFraction is correct, solution === `${p}/${q}`.
  // (gcd(p, q) === 1 and q >= 2 guarantee the result is always a `p/q` string,
  //  never an integer collapse — since q >= 2, the denominator never reduces to 1.)
  const solution = canonicalizeFraction(concrete.p, concrete.q);

  return {
    problem: {
      prompt: problemPrompt,
      representation: concrete.representationLevel,
    },
    solution,
    steps: [stepNumerator, stepDenominator],
    representation: concrete.representationLevel,
    skillNode: 'fraction-simplification',
  };
}

// ---------------------------------------------------------------------------
// The fraction-simplification Generator implementation
// ---------------------------------------------------------------------------

/**
 * fractionSimplification — the `Generator` implementation for the
 * 'fraction-simplification' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key
 * `'fraction-simplification'` (Phase 7, when the graph node is also added).
 * The registry's `assertEveryGeneratorHasNode` verifies this key matches a node.
 *
 * D9 CHECKER RELATIONSHIP:
 *   This generator does NOT use the Phase-2 fraction checker branch.
 *   The two integer steps (numerator p, denominator q) are checked independently
 *   via canonicalize() + SCALAR_INTEGER_POLICY — the existing integer path.
 *   task.solution uses canonicalizeFraction() to prove D1, but the checker
 *   compares outputs against step.expected (which are plain integer strings).
 */
export const fractionSimplification: Generator = {
  skillNode: 'fraction-simplification',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
