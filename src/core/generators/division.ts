/**
 * division.ts — The division generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers).
 *
 * DIVISION-AS-INVERSE-MULTIPLICATION CONCEPT:
 *   A division fact: c ÷ a = q. The learner is shown the dividend `c` and the
 *   divisor `a` and must supply the quotient `q`. Backward construction: draw
 *   the QUOTIENT q FIRST (the answer), then the divisor a, then derive the
 *   dividend c = a * q last. This guarantees c is always exactly divisible by
 *   a (no remainder ever appears — the task is always solvable), mirroring
 *   multiplication's 'missing-factor' form (a × ▢ = c) but framed as division.
 *
 * BAND PARAMS (`params: { tableMax: number }`):
 *   - tableMax bounds BOTH the quotient `q` (the answer) and the divisor `a` —
 *     both drawn from the same times-table range [2, tableMax].
 *
 * CPA LADDER (deliberately flat — all abstract, all 'number' inputMode, mirrors
 * multiplication's flat abstract-only representation):
 *   Band 0 abstract [0.0, 0.5) → tableMax 5
 *   Band 1 abstract [0.5, 1.0+) → tableMax 10
 *
 *   NO CPA variation — like multiplication, division isolates the fluency
 *   dimension of mastery rather than varying representation level.
 *
 * STEPS:
 *   A single integer step — the quotient.
 *   step.expected = canonicalize(q) via SCALAR_INTEGER_POLICY.
 *   Language-neutral { key, vars } prompt; vars carry the dividend and divisor
 *   (a, c) — never the quotient (that would give the answer away).
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and step.prompt are LocalizedRef ({ key, vars }) —
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
import { canonicalize, SCALAR_INTEGER_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (division specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for division.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface DivisionBandParams {
  /** Maximum value for both the quotient `q` (the answer) and the divisor `a`. */
  readonly tableMax: number;
}

/**
 * Narrow `band.params` to `DivisionBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): DivisionBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).tableMax !== 'number'
  ) {
    throw new Error(
      '[division] Band params have unexpected shape. ' +
        'Expected { tableMax: number }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as DivisionBandParams;
}

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface DivisionConcreteParams {
  /** The divisor `a` (known/shown). */
  readonly a: number;
  /** The dividend `c` = a * q (known/shown; derived last). */
  readonly c: number;
  /** The quotient `q` — the answer (drawn first, never shown in vars). */
  readonly q: number;
  /** The representation level from the band (always 'abstract' for division). */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): DivisionConcreteParams
 *
 * Reads the band's `params` to determine the table range, then draws the
 * QUOTIENT q (the answer) FIRST from `rng` (backward generation), then the
 * divisor a, then derives the dividend c = a * q LAST.
 *
 * Backward generation guarantee: the answer (the quotient) is chosen before
 * the problem is stated. This also guarantees the dividend is always exactly
 * divisible by the divisor — no remainder case ever arises.
 *
 * Construction invariant: c === a * q, 2 <= q <= tableMax, 2 <= a <= tableMax.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer value.
 */
function instantiate(band: Band, rng: SeededRng): DivisionConcreteParams {
  const p = narrowBandParams(band.params);

  // Draw the quotient q FIRST (the answer) from [2, tableMax].
  const q = rng.nextInt(2, p.tableMax);
  // Draw the divisor a SECOND, also from [2, tableMax].
  const a = rng.nextInt(2, p.tableMax);
  // Derive the dividend c LAST (backward construction: answer is known first).
  const c = a * q;

  return {
    a,
    c,
    q,
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
 *   - expected = canonicalize(q) with SCALAR_INTEGER_POLICY.
 *   - prompt.vars carry { a, c } (NEVER q — that would give the answer away).
 *   - inputMode is always 'number' (flat abstract — no CPA ladder, mirrors
 *     multiplication's deliberate flat representation).
 *   - solution === steps[0].expected.
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

  // Build the single integer step. inputMode is always 'number' — division
  // deliberately isolates the fluency dimension via flat abstract-only
  // representation (mirrors multiplication's D8-style invariant).
  const step: Step = {
    prompt: {
      key: 'division.step.quotient',
      // vars carry the divisor and dividend — NEVER the quotient (the answer).
      vars: { a: concrete.a, c: concrete.c },
    },
    inputMode: 'number',
    // expected is the canonical string of the pre-chosen quotient (backward construction).
    expected: canonicalize(concrete.q),
    skillNode: 'division',
    // elicitFromMastery: propagate from the difficulty envelope.
    elicitFromMastery: difficulty.elicitFromMastery,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  } satisfies Step;

  // solution === steps[0].expected for a single-step task.
  const solution = canonicalize(concrete.q);

  // Build the language-neutral problem prompt.
  // vars carry ONLY the divisor and dividend — never the quotient (leaking the
  // answer into the problem prompt would give it away). The presentation
  // layer renders "c ÷ a = ?" from these two values.
  return {
    problem: {
      prompt: {
        key: 'division.problem',
        vars: { a: concrete.a, c: concrete.c },
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps: [step],
    representation: concrete.representationLevel,
    skillNode: 'division',
  };
}

// ---------------------------------------------------------------------------
// The division Generator implementation
// ---------------------------------------------------------------------------

/**
 * division — the `Generator` implementation for the 'division' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key `'division'`
 * (integrator responsibility — this file only implements the contract; wiring
 * into the registry/graph is out of scope here).
 */
export const division: Generator = {
  skillNode: 'division',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
