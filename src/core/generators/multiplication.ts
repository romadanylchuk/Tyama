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
 * TWO FORMS (`params.form`, discriminated union — see `MultiplicationBandParams`):
 *   - 'product' (default; existing behavior, UNCHANGED):
 *       A multiplication fact: factorA × factorB = product.
 *       The learner is asked to supply the product.
 *       Backward construction: draw factorA and factorB first, derive
 *       product = factorA * factorB. The product is never inverted/factored.
 *   - 'missing-factor' (division readiness — the a × ▢ = c bridge):
 *       The equation a × ▢ = c hides the SECOND factor behind a box. The
 *       learner supplies the missing factor. Backward construction: draw the
 *       missing factor `x` (the answer) and the known factor `a` FIRST, both
 *       from the table range `[1, tableMax]`; derive `c = a * x` last.
 *       This is the multiplicative mirror of `unknown-as-missing-addend`
 *       (a + ▢ = c) and is the pictorial/abstract precursor to division.
 *
 * BAND PARAMS (`params: MultiplicationBandParams`, a discriminated union):
 *   - `{ aMax: number; bMax: number; form?: 'product' }` (form omitted or
 *     'product'): aMax/bMax bound factorA/factorB — IDENTICAL to the
 *     pre-existing shape (no band in the graph asset needs to change).
 *   - `{ form: 'missing-factor'; tableMax: number }`: tableMax bounds BOTH
 *     the known factor `a` and the missing factor `x` (the answer).
 *
 * CPA LADDER (deliberately flat — all abstract, all 'number' inputMode):
 *   Band 0 abstract [0.00, 0.40) → form 'product';        aMax=5,  bMax=5
 *   Band 1 abstract [0.40, 0.70) → form 'product';        aMax=9,  bMax=9
 *   Band 2 abstract [0.70, 0.85) → form 'product';        aMax=12, bMax=12
 *   Band 3 abstract [0.85, 1.00+) → form 'missing-factor'; tableMax=12
 *
 *   NO CPA variation — multiplication deliberately isolates the SPEED dimension
 *   of mastery. The per-node targetMs override (shipped on the graph node in
 *   Phase 7) is the exemplar of the config-as-data mastery override hook.
 *
 * STEPS:
 *   A single integer step.
 *     'product' form:        expected = canonicalize(product); vars { a, b }.
 *     'missing-factor' form: expected = canonicalize(x);       vars { a, c }.
 *   step.expected = canonicalize(answer) via SCALAR_INTEGER_POLICY in both forms.
 *   Neither form's vars ever carry the answer value.
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
 * The per-band param shape for the 'product' form (existing behavior).
 * `form` is optional and defaults to 'product' — the three pre-existing
 * bands in the graph asset carry no `form` field at all and are unaffected.
 */
interface ProductBandParams {
  readonly form?: 'product';
  /** Maximum value for factorA (inclusive). Positive integer. */
  readonly aMax: number;
  /** Maximum value for factorB (inclusive). Positive integer. */
  readonly bMax: number;
}

/**
 * The per-band param shape for the 'missing-factor' form (division
 * readiness: a × ▢ = c). `tableMax` bounds BOTH the known factor `a` and
 * the missing factor `x` (the answer) — both are drawn from the same
 * times-table range.
 */
interface MissingFactorBandParams {
  readonly form: 'missing-factor';
  /** Maximum value for both the known factor `a` and the missing factor `x`. */
  readonly tableMax: number;
}

/**
 * The per-band param shape for multiplication — a discriminated union on
 * `form`. Carried in Band.params (typed `unknown` at the core level;
 * narrowed here).
 */
type MultiplicationBandParams = ProductBandParams | MissingFactorBandParams;

/**
 * Narrow `band.params` to `MultiplicationBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 *
 * `form` absent or `'product'` → the pre-existing `{ aMax, bMax }` shape
 * (byte-identical validation to before this field existed).
 * `form === 'missing-factor'` → the new `{ tableMax }` shape.
 */
function narrowBandParams(params: unknown): MultiplicationBandParams {
  if (typeof params !== 'object' || params === null) {
    throw new Error(
      '[multiplication] Band params have unexpected shape. ' +
        'Expected { aMax: number; bMax: number } or ' +
        "{ form: 'missing-factor'; tableMax: number }. " +
        `Got: ${JSON.stringify(params)}`
    );
  }

  const p = params as Record<string, unknown>;

  if (p.form === 'missing-factor') {
    if (typeof p.tableMax !== 'number') {
      throw new Error(
        '[multiplication] Band params have unexpected shape. ' +
          "Expected { form: 'missing-factor'; tableMax: number }. " +
          `Got: ${JSON.stringify(params)}`
      );
    }
    return { form: 'missing-factor', tableMax: p.tableMax };
  }

  if (typeof p.aMax !== 'number' || typeof p.bMax !== 'number') {
    throw new Error(
      '[multiplication] Band params have unexpected shape. ' +
        'Expected { aMax: number; bMax: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return { form: 'product', aMax: p.aMax, bMax: p.bMax };
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface MultiplicationConcreteParams {
  /**
   * The known factor `a`, always shown to the learner in both forms.
   * 'product' form: drawn from [1, aMax]. 'missing-factor' form: drawn from
   * [1, tableMax].
   */
  readonly factorA: number;
  /**
   * 'product' form: the SECOND KNOWN factor (drawn from [1, bMax]) — shown.
   * 'missing-factor' form: the MISSING factor `x` (drawn from [1, tableMax])
   * — this is the answer the learner must supply, never shown in vars.
   */
  readonly factorB: number;
  /**
   * The product: factorA * factorB.
   * 'product' form: the ANSWER (hidden; known before the problem is stated).
   * 'missing-factor' form: KNOWN and shown (`c` in `a × ▢ = c`).
   */
  readonly product: number;
  /** Which form this concrete instantiation belongs to. */
  readonly form: 'product' | 'missing-factor';
  /** The representation level from the band (always 'abstract' for multiplication). */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): MultiplicationConcreteParams
 *
 * Reads the band's `params` to determine the form and ranges, then draws
 * concrete values from `rng` FIRST (backward generation).
 *
 * 'missing-factor' form: draws the missing factor `x` (the answer) and the
 * known factor `a` FIRST, both from [1, tableMax]; derives c = a * x last.
 *
 * 'product' form (default; UNCHANGED from before this field existed): draws
 * factorA then factorB from [1, aMax]/[1, bMax]; derives product = factorA * factorB.
 * The rng draw order and values are byte-identical to the pre-existing behavior.
 *
 * Backward generation guarantee: the answer is chosen before the problem is
 * stated. This makes it impossible to produce an ambiguous problem.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with the pre-chosen answer.
 */
function instantiate(band: Band, rng: SeededRng): MultiplicationConcreteParams {
  const p = narrowBandParams(band.params);

  if (p.form === 'missing-factor') {
    // Backward construction: draw the missing factor x (the answer) and the
    // known factor a FIRST, both from the shared table range — before the
    // product c is derived.
    const factorB = rng.nextInt(1, p.tableMax); // x — the missing factor (the answer).
    const factorA = rng.nextInt(1, p.tableMax); // a — the known factor (shown).
    const product = factorA * factorB; // c — derived last, known/shown.

    return {
      factorA,
      factorB,
      product,
      form: 'missing-factor',
      representationLevel: band.representationLevel,
    };
  }

  // 'product' form (default) — UNCHANGED: draw factors from [1, max] (positive
  // integers; 0 would trivialize the task).
  const factorA = rng.nextInt(1, p.aMax);
  const factorB = rng.nextInt(1, p.bMax);

  // Derive product by multiplication (backward construction: answer is known first).
  const product = factorA * factorB;

  return {
    factorA,
    factorB,
    product,
    form: 'product',
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
 * Single step emitted, branching on `concrete.form`:
 *   'product' form (UNCHANGED):
 *     - expected = canonicalize(product) with SCALAR_INTEGER_POLICY.
 *     - prompt.vars carry { a: factorA, b: factorB } (NOT the product).
 *     - keys 'multiplication.problem' / 'multiplication.step.product'.
 *   'missing-factor' form:
 *     - expected = canonicalize(factorB) — the missing factor `x`.
 *     - prompt.vars carry { a: factorA, c: product } (NEVER factorB/x).
 *     - keys 'multiplication.problem.missing_factor' /
 *       'multiplication.step.missing_factor'.
 * inputMode is always 'number' in both forms (flat abstract — no CPA ladder).
 * solution === steps[0].expected in both forms.
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

  // Materialize concrete values (backward generation: answer chosen first).
  const concrete = instantiate(bandFromDifficulty, rng) as MultiplicationConcreteParams;

  if (concrete.form === 'missing-factor') {
    // The missing factor x (concrete.factorB) is the answer; a (factorA) and
    // c (product) are known/shown. vars NEVER carry factorB.
    const step: Step = {
      prompt: {
        key: 'multiplication.step.missing_factor',
        vars: { a: concrete.factorA, c: concrete.product },
      },
      inputMode: 'number',
      // expected is the canonical string of the pre-chosen missing factor.
      expected: canonicalize(concrete.factorB),
      skillNode: 'multiplication',
      elicitFromMastery: difficulty.elicitFromMastery,
      normalizationPolicy: SCALAR_INTEGER_POLICY,
    } satisfies Step;

    const solution = canonicalize(concrete.factorB);

    return {
      problem: {
        prompt: {
          key: 'multiplication.problem.missing_factor',
          vars: { a: concrete.factorA, c: concrete.product },
        },
        representation: concrete.representationLevel,
      },
      solution,
      steps: [step],
      representation: concrete.representationLevel,
      skillNode: 'multiplication',
    };
  }

  // 'product' form — UNCHANGED from before the 'missing-factor' form existed.
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
