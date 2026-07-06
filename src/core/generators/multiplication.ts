/**
 * multiplication.ts — The multiplication generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * MULTIPLICATION CONCEPT:
 *   A multiplication fact: factorA × factorB = product.
 *   The learner is asked to supply the product.
 *   Backward construction: draw factorA and factorB first, derive product = factorA * factorB.
 *   The product is never inverted/factored — it is always a direct multiplication.
 *
 * BAND PARAMS (`params: { aMax: number; bMax: number }`):
 *   - aMax: maximum value for factorA (inclusive). Draw from [1, aMax].
 *   - bMax: maximum value for factorB (inclusive). Draw from [1, bMax].
 *
 * CPA LADDER (deliberately flat — all abstract, all 'number' inputMode):
 *   Band 0 abstract [0.0, 0.4) → aMax=5,  bMax=5
 *   Band 1 abstract [0.4, 0.7) → aMax=9,  bMax=9
 *   Band 2 abstract [0.7, 1.0+) → aMax=12, bMax=12
 *
 *   NO CPA variation — multiplication deliberately isolates the SPEED dimension
 *   of mastery. The per-node targetMs override (shipped on the graph node in
 *   Phase 7) is the exemplar of the config-as-data mastery override hook.
 *
 * STEPS:
 *   A single integer step — the product.
 *   step.expected = canonicalize(product) via SCALAR_INTEGER_POLICY.
 *   step.prompt carries { a, b } vars (NOT the product — that would give it away).
 *
 * TIMING NOTE:
 *   The speed gate (targetMs) comes from the stage-04 mastery config
 *   (DEFAULT_MASTERY_CONFIG.targetMs, overridable per-node via DifficultyHooks.mastery).
 *   The generator carries NO timing — it is clock-free and byte-reproducible.
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys.
 *
 * ANTI-SHAME:
 *   No shaming vocabulary anywhere in this module. Steps are sub-answers,
 *   not 'correct/wrong' verdicts (that is stage-03's concern).
 *
 * LINT:
 *   All randomness is drawn through the `rng` parameter.
 *   `Math.random` is banned in src/core/** by the no-adhoc-number-format rule.
 */

import type { Generator, GeneratedTask, DifficultyParams, Band, SeededRng, Step } from '@/core/types';
import { canonicalize, SCALAR_INTEGER_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (multiplication specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for multiplication.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface MultiplicationBandParams {
  /** Maximum value for factorA (inclusive). Positive integer. */
  readonly aMax: number;
  /** Maximum value for factorB (inclusive). Positive integer. */
  readonly bMax: number;
}

/**
 * Narrow `band.params` to `MultiplicationBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): MultiplicationBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).aMax !== 'number' ||
    typeof (params as Record<string, unknown>).bMax !== 'number'
  ) {
    throw new Error(
      '[multiplication] Band params have unexpected shape. ' +
        'Expected { aMax: number; bMax: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as MultiplicationBandParams;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface MultiplicationConcreteParams {
  /** First factor (drawn from [1, aMax]). */
  readonly factorA: number;
  /** Second factor (drawn from [1, bMax]). */
  readonly factorB: number;
  /** The product: factorA * factorB (the answer; known before problem is stated). */
  readonly product: number;
  /** The representation level from the band (always 'abstract' for multiplication). */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): MultiplicationConcreteParams
 *
 * Reads the band's `params` to determine the factor ranges, then draws
 * concrete values from `rng` FIRST (backward generation). The product is
 * derived by multiplication — never inverted or factored.
 *
 * Backward generation guarantee: product = factorA * factorB is chosen before
 * the problem is stated. This makes it impossible to produce an ambiguous problem.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen product.
 */
function instantiate(band: Band, rng: SeededRng): MultiplicationConcreteParams {
  const p = narrowBandParams(band.params);

  // Draw factors from [1, max] (positive integers; 0 would trivialize the task).
  const factorA = rng.nextInt(1, p.aMax);
  const factorB = rng.nextInt(1, p.bMax);

  // Derive product by multiplication (backward construction: answer is known first).
  const product = factorA * factorB;

  return {
    factorA,
    factorB,
    product,
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
 *   - expected = canonicalize(product) with SCALAR_INTEGER_POLICY.
 *   - inputMode is always 'number' (flat abstract — no CPA ladder).
 *   - prompt.vars carry { a: factorA, b: factorB } (NOT the product).
 *   - solution === steps[0].expected.
 *
 * Speed gate note: targetMs comes from the stage-04 mastery config, not from
 * the generator. This generator carries no timing and is clock-free.
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

  // Materialize concrete values (backward generation: product chosen first).
  const concrete = instantiate(bandFromDifficulty, rng) as MultiplicationConcreteParams;

  // Build the single integer step.
  // inputMode is always 'number' — multiplication deliberately isolates the speed
  // dimension via flat abstract-only representation (D8 invariant: no CPA variation).
  const step: Step = {
    prompt: {
      key: 'multiplication.step.product',
      // vars carry factorA and factorB — NOT the product (that would give it away).
      vars: { a: concrete.factorA, b: concrete.factorB },
    },
    inputMode: 'number',
    // expected is the canonical string of the pre-chosen product (backward construction).
    expected: canonicalize(concrete.product),
    skillNode: 'multiplication',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution === steps[0].expected for a single-step task.
  const solution = canonicalize(concrete.product);

  return {
    problem: {
      prompt: {
        key: 'multiplication.problem',
        vars: { a: concrete.factorA, b: concrete.factorB },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [step],
    representation: concrete.representationLevel,
    skillNode: 'multiplication',
  };
}

// ---------------------------------------------------------------------------
// The multiplication Generator implementation
// ---------------------------------------------------------------------------

/**
 * multiplication — the `Generator` implementation for the 'multiplication' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key `'multiplication'`
 * (Phase 7, when the graph node is also added). The registry's
 * `assertEveryGeneratorHasNode` verifies this key matches a graph node.
 */
export const multiplication: Generator = {
  skillNode: 'multiplication',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
