/**
 * fruit-equations.ts — The fruit-equations generator.
 *
 * BACKWARD GENERATION (DL-2 + locked decision §12.2):
 *   Tasks are constructed BACKWARD from a pre-chosen answer drawn via `rng`.
 *   This guarantees:
 *     - A unique, known-correct solution (no answer-search needed).
 *     - Deterministic step.expected values (same seed → same task).
 *     - Zero floating-point arithmetic on the answer path (all integers for MVP).
 *
 * FRUIT-EQUATIONS CONCEPT:
 *   An equation where quantities of fruit icons substitute for abstract numbers
 *   (the "pictorial bridge" in CPA pedagogy). Example:
 *     🍎 + 🍎 + 🍊 = 7,  find 🍎 and 🍊 separately.
 *   Each unknown fruit quantity is the "answer" drawn first; the total is derived
 *   by summing.
 *
 * BAND PARAMS (`params: { unknowns: number; range: number; negatives: boolean }`):
 *   - unknowns: how many distinct fruit types have unknown quantities (1 or 2).
 *   - range: each unknown is drawn from [1, range] (or [-range, range] if negatives).
 *     When negatives is true, the sign is drawn uniformly; zero is excluded.
 *   - negatives: whether drawn values may be negative.
 *
 * STEPS:
 *   For unknowns === 1: one step ("what is apple?").
 *   For unknowns === 2: two ordered steps ("what is apple?", "what is banana?").
 *   Each step.expected is canonicalize(drawnValue) — never ad-hoc formatted.
 *   Each step carries SCALAR_DECIMAL_POLICY so the stage-03 checker reads the
 *   identical policy off the same Step object (DL-3; divergence impossible).
 *
 * LANGUAGE-NEUTRAL:
 *   problem.prompt and each step.prompt are LocalizedRef ({ key, vars }) —
 *   never raw localized strings. The presentation layer resolves keys.
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
import { canonicalize, SCALAR_DECIMAL_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Band params shape (fruit-equations specific)
// ---------------------------------------------------------------------------

/**
 * The per-band param shape for fruit-equations.
 * Carried in Band.params (typed `unknown` at the core level; narrowed here).
 */
interface FruitBandParams {
  /** Number of distinct fruit types with unknown quantities: 1 or 2. */
  readonly unknowns: number;
  /** Draw range: unknown quantities drawn from [1..range] (or negatives). */
  readonly range: number;
  /** Whether negative values are allowed (only on higher difficulty bands). */
  readonly negatives: boolean;
}

/**
 * Narrow `band.params` to `FruitBandParams`.
 * Throws if the shape is missing required fields (programmer error — band
 * params come from the graph asset which is validated at startup).
 */
function narrowBandParams(params: unknown): FruitBandParams {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as Record<string, unknown>).unknowns !== 'number' ||
    typeof (params as Record<string, unknown>).range !== 'number' ||
    typeof (params as Record<string, unknown>).negatives !== 'boolean'
  ) {
    throw new Error(
      '[fruit-equations] Band params have unexpected shape. ' +
        'Expected { unknowns: number; range: number; negatives: boolean }. ' +
        `Got: ${JSON.stringify(params)}`
    );
  }
  return params as FruitBandParams;
}

// ---------------------------------------------------------------------------
// Fruit names (stable — not localized; only the slot labels are i18n keys)
// ---------------------------------------------------------------------------

/**
 * Stable slot identifiers for fruit unknowns.
 * Only 2 are needed for the MVP band params (unknowns <= 2).
 * The presentation layer maps these keys to icons/localized names.
 */
const FRUIT_SLOTS = ['apple', 'banana'] as const;
type FruitSlot = (typeof FRUIT_SLOTS)[number];

// ---------------------------------------------------------------------------
// ConcreteParams — the materialized instantiation result
// ---------------------------------------------------------------------------

/**
 * The concrete parameter set produced by `instantiate()`.
 * Generator-internal; returned as `unknown` from the `Generator` interface.
 */
interface FruitConcreteParams {
  /** Quantities for each fruit slot, indexed by slot name. */
  readonly quantities: Record<FruitSlot, number>;
  /** Ordered list of active unknowns for this task. */
  readonly unknownSlots: readonly FruitSlot[];
  /** The pre-chosen sum of all unknown quantities. */
  readonly total: number;
  /** The representation level from the band. */
  readonly representationLevel: 'concrete' | 'pictorial' | 'abstract';
}

// ---------------------------------------------------------------------------
// instantiate — band → concrete numbers (backward generation core)
// ---------------------------------------------------------------------------

/**
 * instantiate(band, rng): FruitConcreteParams
 *
 * Reads the band's `params` to determine the task shape, then draws concrete
 * values from `rng` FIRST (backward generation). The equation is constructed
 * from the drawn values — the total is derived, not guessed.
 *
 * Backward generation guarantee: the answer is chosen before the problem is
 * stated. This makes it impossible for the construction to produce an
 * ill-formed or ambiguous problem.
 *
 * @param band - The selected difficulty band (opaque params narrowed here).
 * @param rng  - Seeded PRNG; all randomness flows through this.
 * @returns     Concrete task parameters with pre-chosen answer quantities.
 */
function instantiate(band: Band, rng: SeededRng): FruitConcreteParams {
  const p = narrowBandParams(band.params);

  // Clamp unknowns to the available fruit slots (1 or 2 for MVP).
  const numUnknowns = Math.min(Math.max(1, p.unknowns), FRUIT_SLOTS.length);
  const unknownSlots = FRUIT_SLOTS.slice(0, numUnknowns) as FruitSlot[];

  // Draw each unknown quantity backward (choose the answer first).
  const quantities: Record<string, number> = {};
  for (const slot of unknownSlots) {
    let value: number;
    if (p.negatives) {
      // Draw a non-zero value in [-range, range] (exclude 0 by forcing sign draw).
      const magnitude = rng.nextInt(1, p.range);
      // Draw sign: 0 → positive, 1 → negative.
      const sign = rng.nextInt(0, 1) === 0 ? 1 : -1;
      value = sign * magnitude;
    } else {
      // Positive only: [1, range].
      value = rng.nextInt(1, p.range);
    }
    quantities[slot] = value;
  }

  // Derive the total by summing the quantities (backward construction: total is known).
  const total = unknownSlots.reduce((sum, slot) => sum + quantities[slot], 0);

  return {
    quantities: quantities as Record<FruitSlot, number>,
    unknownSlots,
    total,
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
 * Uses `selectBand` indirectly via the caller (the generator is given the full
 * `difficulty` envelope, which already carries the selected band's `params` inside
 * `difficulty.params`). Wait — the generator receives `DifficultyParams` which has
 * `params: unknown` — that IS the band.params opaque payload forwarded by the
 * caller who ran `selectBand`.
 *
 * Steps are ordered: for unknowns=1, one step; for unknowns=2, two steps.
 * Each step.expected is canonicalize(quantity) — shared canonical form.
 *
 * BYTE REPRODUCIBILITY:
 *   same `difficulty` + same `rng` seed → identical `GeneratedTask`.
 *   All randomness flows through `rng`; no Date.now(), no Math.random().
 */
function generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
  // Build a temporary Band from the difficulty envelope's params and representationLevel.
  // The `difficulty.params` IS the band.params (forwarded by the scheduler/engine).
  const bandFromDifficulty: Band = {
    minCoordinate: 0, // not needed for instantiate — only params and representationLevel matter.
    representationLevel: difficulty.representationLevel,
    params: difficulty.params,
  };

  // Materialize concrete quantities (backward generation: answer chosen first).
  const concrete = instantiate(bandFromDifficulty, rng) as FruitConcreteParams;

  // Build ordered steps (one per unknown slot).
  const steps: Step[] = concrete.unknownSlots.map((slot) => {
    const quantity = concrete.quantities[slot];
    return {
      prompt: {
        key: `fruit_eq.step.${slot}`,
        vars: { slot },
      },
      inputMode: concrete.representationLevel === 'pictorial' ? 'tokens' : 'number',
      // expected is the canonical string of the pre-chosen answer (backward construction).
      expected: canonicalize(quantity),
      skillNode: 'fruit-equations',
      // elicitFromMastery: propagate from the difficulty envelope (stage-04 computes the
      // threshold; stages 02-03 carry the shape without interpreting it).
      elicitFromMastery: difficulty.elicitFromMastery,
      normalizationPolicy: SCALAR_DECIMAL_POLICY,
    } satisfies Step;
  });

  // The solution for the whole task is the canonical total.
  // (For unknowns=1, solution === steps[0].expected; for unknowns=2, it's the sum.)
  const solution = canonicalize(concrete.total);

  // Build the language-neutral problem prompt.
  // vars carry the total and each fruit slot quantity so the presentation layer
  // can render the full equation (e.g. "apple + banana = 7, find apple and banana").
  const vars: Record<string, string | number> = { total: concrete.total };
  for (const slot of concrete.unknownSlots) {
    // We do NOT include the answers in the prompt vars (that would give it away).
    // Only the total and slot placeholders are needed for the problem statement.
    vars[`slot_${slot}`] = slot; // slot marker (presentation layer renders as icon).
  }

  return {
    problem: {
      prompt: {
        key: `fruit_eq.problem.unknowns_${concrete.unknownSlots.length}`,
        vars,
      },
      representation: concrete.representationLevel,
    },
    solution,
    steps,
    representation: concrete.representationLevel,
    skillNode: 'fruit-equations',
  };
}

// ---------------------------------------------------------------------------
// The fruit-equations Generator implementation
// ---------------------------------------------------------------------------

/**
 * fruitEquations — the `Generator` implementation for the 'fruit-equations' node.
 *
 * Registered in `GENERATORS` in `registry.ts` under the key `'fruit-equations'`.
 * The registry's `assertEveryGeneratorHasNode` verifies this key matches a graph node.
 */
export const fruitEquations: Generator = {
  skillNode: 'fruit-equations',

  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask {
    return generate(difficulty, rng);
  },

  instantiate(band: Band, rng: SeededRng): unknown {
    return instantiate(band, rng);
  },
};
