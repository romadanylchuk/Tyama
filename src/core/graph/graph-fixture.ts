/**
 * graph-fixture.ts — SMOKE-TEST FIXTURE — NOT THE MVP CATALOG
 *
 * This module exports a labelled 6-node `GraphDefinition` for use during
 * stage-05 development and CI. It is NOT the production skill graph.
 *
 * PURPOSE:
 *   - Proves `loadGraph()` → `validateGraph()` → `selectBand()` → generator
 *     pipeline is wired correctly end-to-end.
 *   - Provides a fixture graph the registry and scheduling tests can use
 *     without a real authored catalog.
 *
 * FIXTURE FLAG:
 *   `fixture: true` is set on this asset. `loadGraph()` emits a dev-mode
 *   warning when it detects this flag, so the smoke-test graph can never
 *   silently masquerade as a real catalog.
 *
 * CONFIG-AS-DATA:
 *   Difficulty bands are shipped as working defaults here. The `pedagogy-pass`
 *   calibrates these values later as a pure data change (no code change needed).
 *
 * TWO VERSION AXES:
 *   `graphVersion: '0.3.0'` tracks the graph-content axis ONLY.
 *   It is NEVER conflated with `DB_SCHEMA_VERSION` / `PRAGMA user_version`.
 *
 * VERSION HISTORY:
 *   0.2.1 — `addition-within-20` and `unknown-as-missing-addend` gain real
 *           band ladders + registered generators (previously stub single-band
 *           generator-less placeholders). No node identity changed (no
 *           split/merge/rename), so `GRAPH_MIGRATIONS['0.2.0']` is a no-op.
 *   0.3.0 — Six new generator-backed nodes ADDED: `subtraction-within-20`,
 *           `place-value`, `division`, `rounding`, `word-problems`,
 *           `decimal-comparison`. No existing node is split, merged, or
 *           renamed, so `GRAPH_MIGRATIONS['0.2.1']` is a no-op.
 *
 * NODES (smoke-test fixture, not MVP catalog):
 *   - `addition-within-20`        — root node, no prerequisites; generator-backed.
 *   - `unknown-as-missing-addend` — prerequisite: addition-within-20; generator-backed.
 *   - `fruit-equations`           — generator-backed node; prerequisites: both above.
 *   - `number-bonds`              — generator-backed node; prerequisite: addition-within-20.
 *   - `multiplication`            — generator-backed node; prerequisite: number-bonds.
 *   - `fraction-simplification`   — generator-backed node; prerequisite: fruit-equations.
 *   - `subtraction-within-20`     — generator-backed node; prerequisite: addition-within-20.
 *   - `place-value`               — generator-backed node; prerequisite: addition-within-20.
 *   - `division`                  — generator-backed node; prerequisite: multiplication.
 *   - `rounding`                  — generator-backed node; prerequisite: place-value.
 *   - `word-problems`             — generator-backed node; prerequisites: multiplication, subtraction-within-20.
 *   - `decimal-comparison`        — generator-backed node; prerequisite: place-value.
 */

import type { GraphDefinition } from '@/core/types';

// ---------------------------------------------------------------------------
// Graph asset (pure data literal — no logic, no Date.now(), no side effects)
// ---------------------------------------------------------------------------

/**
 * GRAPH_FIXTURE — the labelled 6-node smoke-test fixture.
 *
 * Do NOT import this directly — use `loadGraph()` from `load-graph.ts`.
 * The indirection enables future OTA graph swaps with no consumer change.
 */
export const GRAPH_FIXTURE: GraphDefinition = {
  graphVersion: '0.3.0',
  fixture: true,
  nodes: [
    // -------------------------------------------------------------------------
    // addition-within-20 — root node (no prerequisites)
    // Skill: recognising addition facts for sums ≤ 20 (a + b = sum).
    // Generator-backed: the additionWithin20 generator draws the sum first
    // (backward construction), then splits it into two addends.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (concrete)  [0.00, 0.40) — manipulative; maxTotal 10
    //   Band 1 (pictorial) [0.40, 0.70) — choice;       maxTotal 15
    //   Band 2 (abstract)  [0.70, 1.00+) — number-pad;   maxTotal 20
    //
    // `params` shape: { maxTotal: number }
    // Only the addition-within-20 generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'addition-within-20',
      prerequisites: [],
      representationLevels: ['concrete', 'pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'concrete',
            params: { maxTotal: 10 },
          },
          {
            minCoordinate: 0.4,
            representationLevel: 'pictorial',
            params: { maxTotal: 15 },
          },
          {
            minCoordinate: 0.7,
            representationLevel: 'abstract',
            params: { maxTotal: 20 },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // unknown-as-missing-addend — prerequisite: addition-within-20
    // Skill: identifying the missing addend in an equation (a + ▢ = c) — the
    // first bridge to algebra. Generator-backed: the unknownAsMissingAddend
    // generator draws the missing addend `x` first (backward construction).
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (concrete)  [0.00, 0.40) — manipulative; maxTotal 10
    //   Band 1 (pictorial) [0.40, 0.70) — choice;       maxTotal 15
    //   Band 2 (abstract)  [0.70, 1.00+) — number-pad;   maxTotal 20
    //
    // `params` shape: { maxTotal: number }
    // Only the unknown-as-missing-addend generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'unknown-as-missing-addend',
      prerequisites: ['addition-within-20'],
      representationLevels: ['concrete', 'pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'concrete',
            params: { maxTotal: 10 },
          },
          {
            minCoordinate: 0.4,
            representationLevel: 'pictorial',
            params: { maxTotal: 15 },
          },
          {
            minCoordinate: 0.7,
            representationLevel: 'abstract',
            params: { maxTotal: 20 },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // fruit-equations — generator-backed node
    // Prerequisites: addition-within-20, unknown-as-missing-addend.
    // The live node for stage-02; the fruit-equations generator binds to this.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (easy)         [0.00, 0.40)  — pictorial,  1 unknown, range  5, no negatives
    //   Band 1 (medium)       [0.40, 0.70)  — pictorial,  2 unknowns, range 10, no negatives
    //   Band 2 (hard)         [0.70, 0.85)  — abstract,   2 unknowns, range 20, negatives OK
    //   Band 3 (cherry-tier)  [0.85, 1.00+) — abstract,   3 unknowns, range 20, negatives OK
    //     — the triangular 3-equation chain (🍎×coeff=total1, 🍎+🍌=total2, 🍌+🍒=total3),
    //     reserved for high-mastery learners (fruit-equations enhancement).
    //
    // `params` shape: { unknowns: number; range: number; negatives: boolean }
    // Only the fruit-equations generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'fruit-equations',
      prerequisites: ['addition-within-20', 'unknown-as-missing-addend'],
      representationLevels: ['pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'pictorial',
            params: { unknowns: 1, range: 5, negatives: false },
          },
          {
            minCoordinate: 0.4,
            representationLevel: 'pictorial',
            params: { unknowns: 2, range: 10, negatives: false },
          },
          {
            minCoordinate: 0.7,
            representationLevel: 'abstract',
            params: { unknowns: 2, range: 20, negatives: true },
          },
          {
            minCoordinate: 0.85,
            representationLevel: 'abstract',
            params: { unknowns: 3, range: 20, negatives: true },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // number-bonds — generator-backed node (stage-05)
    // Prerequisites: addition-within-20.
    // Skill: whole = partA + partB; learner supplies the missing slot.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (concrete)   [0.00, 0.40)  — manipulative; wholeMax 10, missing 'whole'
    //   Band 1 (pictorial)  [0.40, 0.70)  — choice;       wholeMax 10, missing 'partB'
    //   Band 2 (abstract)   [0.70, 0.85)  — number-pad;   wholeMax 20, missing 'partA'
    //   Band 3 (mastery)    [0.85, 1.00+) — number-pad;   wholeMax 50, missing 'random'
    //     — larger wholes + per-instance slot variety (drawn from rng, not a fixed
    //     literal) for high-mastery learners (number-bonds difficulty enhancement).
    //
    // `params` shape: { wholeMax: number; missingSlot: 'partA' | 'partB' | 'whole' | 'random' }
    // Only the number-bonds generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'number-bonds',
      prerequisites: ['addition-within-20'],
      representationLevels: ['concrete', 'pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'concrete',
            params: { wholeMax: 10, missingSlot: 'whole' },
          },
          {
            minCoordinate: 0.4,
            representationLevel: 'pictorial',
            params: { wholeMax: 10, missingSlot: 'partB' },
          },
          {
            minCoordinate: 0.7,
            representationLevel: 'abstract',
            params: { wholeMax: 20, missingSlot: 'partA' },
          },
          {
            minCoordinate: 0.85,
            representationLevel: 'abstract',
            params: { wholeMax: 50, missingSlot: 'random' },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // multiplication — generator-backed node (stage-05)
    // Prerequisites: number-bonds.
    // Skill: a × b = product; learner supplies the product (abstract only).
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (easy)     [0.00, 0.40)  — abstract; form 'product';        aMax 5,  bMax 5
    //   Band 1 (medium)   [0.40, 0.70)  — abstract; form 'product';        aMax 9,  bMax 9
    //   Band 2 (hard)     [0.70, 0.85)  — abstract; form 'product';        aMax 12, bMax 12
    //   Band 3 (division-readiness) [0.85, 1.00+) — abstract; form 'missing-factor'; tableMax 12
    //
    // `params` shape (discriminated union on `form`):
    //   - `{ aMax: number; bMax: number; form?: 'product' }` (bands 0-2)
    //   - `{ form: 'missing-factor'; tableMax: number }` (band 3 — the
    //     a × ▢ = c bridge toward division; multiplicative mirror of the
    //     `unknown-as-missing-addend` node).
    // Only the multiplication generator narrows this (core never inspects it).
    //
    // Per-node mastery override: `mastery.targetMs` is the exemplar of config-as-data
    // speed-gate customisation (multiplication has a tighter time target than the
    // global default because fluency is the goal for this node).
    // -------------------------------------------------------------------------
    {
      id: 'multiplication',
      prerequisites: ['number-bonds'],
      representationLevels: ['abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'abstract',
            params: { aMax: 5, bMax: 5 },
          },
          {
            minCoordinate: 0.4,
            representationLevel: 'abstract',
            params: { aMax: 9, bMax: 9 },
          },
          {
            minCoordinate: 0.7,
            representationLevel: 'abstract',
            params: { aMax: 12, bMax: 12 },
          },
          {
            minCoordinate: 0.85,
            representationLevel: 'abstract',
            params: { form: 'missing-factor', tableMax: 12 },
          },
        ],
        mastery: { targetMs: 5000 },
      },
    },

    // -------------------------------------------------------------------------
    // fraction-simplification — generator-backed node (stage-05)
    // Prerequisites: fruit-equations.
    // Skill: simplify (p·k)/(q·k) → p/q; two ordered integer steps by default,
    // three (gcd-first) on the middle gcd-scaffold band — see below.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (concrete)     [0.00, 0.40)  — manipulative fraction-bar; small
    //                                          denominators; TWO steps
    //                                          (numerator, denominator).
    //   Band 1 (gcd-scaffold) [0.40, 0.70)  — pictorial, multi-slot entry;
    //                                          `includeGcdStep: true` — THREE
    //                                          steps (gcd, numerator,
    //                                          denominator). The learner
    //                                          explicitly names the common
    //                                          divisor before simplifying,
    //                                          bridging the concrete
    //                                          fraction-bar to the abstract
    //                                          two-step form below.
    //   Band 2 (abstract)     [0.70, 1.00+) — multi-slot entry; larger
    //                                          denominators; back to TWO steps
    //                                          (numerator, denominator).
    //
    // `params` shape: { maxDenominator: number; maxFactor: number; includeGcdStep?: boolean }
    // Only the fraction-simplification generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'fraction-simplification',
      prerequisites: ['fruit-equations'],
      representationLevels: ['concrete', 'pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'concrete',
            params: { maxDenominator: 6, maxFactor: 3 },
          },
          {
            minCoordinate: 0.4,
            representationLevel: 'pictorial',
            params: { maxDenominator: 8, maxFactor: 3, includeGcdStep: true },
          },
          {
            minCoordinate: 0.7,
            representationLevel: 'abstract',
            params: { maxDenominator: 12, maxFactor: 5 },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // subtraction-within-20 — generator-backed node (graphVersion 0.3.0)
    // Prerequisites: addition-within-20.
    // Skill: a subtraction fact m - s = d; the learner supplies the difference.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (concrete)  [0.00, 0.40) — manipulative; maxTotal 10
    //   Band 1 (pictorial) [0.40, 0.70) — choice;       maxTotal 15
    //   Band 2 (abstract)  [0.70, 1.00+) — number-pad;   maxTotal 20
    //
    // `params` shape: { maxTotal: number }
    // Only the subtraction-within-20 generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'subtraction-within-20',
      prerequisites: ['addition-within-20'],
      representationLevels: ['concrete', 'pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'concrete',
            params: { maxTotal: 10 },
          },
          {
            minCoordinate: 0.4,
            representationLevel: 'pictorial',
            params: { maxTotal: 15 },
          },
          {
            minCoordinate: 0.7,
            representationLevel: 'abstract',
            params: { maxTotal: 20 },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // place-value — generator-backed node (graphVersion 0.3.0)
    // Prerequisites: addition-within-20.
    // Skill: decompose a two-digit number n into tens and ones.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (concrete) [0.00, 0.50) — tokens;  maxTens 5
    //   Band 1 (abstract) [0.50, 1.00+) — number;  maxTens 9
    //
    // `params` shape: { maxTens: number }
    // Only the place-value generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'place-value',
      prerequisites: ['addition-within-20'],
      representationLevels: ['concrete', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'concrete',
            params: { maxTens: 5 },
          },
          {
            minCoordinate: 0.5,
            representationLevel: 'abstract',
            params: { maxTens: 9 },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // division — generator-backed node (graphVersion 0.3.0)
    // Prerequisites: multiplication.
    // Skill: division-as-inverse-multiplication, c / a = q; learner supplies q.
    // Deliberately flat abstract-only representation (mirrors multiplication).
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (easy)   [0.00, 0.50) — abstract; tableMax 5
    //   Band 1 (medium) [0.50, 1.00+) — abstract; tableMax 10
    //
    // `params` shape: { tableMax: number }
    // Only the division generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'division',
      prerequisites: ['multiplication'],
      representationLevels: ['abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'abstract',
            params: { tableMax: 5 },
          },
          {
            minCoordinate: 0.5,
            representationLevel: 'abstract',
            params: { tableMax: 10 },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // rounding — generator-backed node (graphVersion 0.3.0)
    // Prerequisites: place-value.
    // Skill: round a number n to the nearest 10.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (pictorial) [0.00, 0.50) — choice;  maxBase 5
    //   Band 1 (abstract)  [0.50, 1.00+) — number; maxBase 9
    //
    // `params` shape: { maxBase: number }
    // Only the rounding generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'rounding',
      prerequisites: ['place-value'],
      representationLevels: ['pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'pictorial',
            params: { maxBase: 5 },
          },
          {
            minCoordinate: 0.5,
            representationLevel: 'abstract',
            params: { maxBase: 9 },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // word-problems — generator-backed node (graphVersion 0.3.0)
    // Prerequisites: multiplication, subtraction-within-20.
    // Skill: a two-step money word problem (total cost, then change received).
    // Abstract-only at the input level for the MVP.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (easy)   [0.00, 0.50) — abstract; maxItems 3, maxPrice 5
    //   Band 1 (medium) [0.50, 1.00+) — abstract; maxItems 5, maxPrice 9
    //
    // `params` shape: { maxItems: number; maxPrice: number }
    // Only the word-problems generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'word-problems',
      prerequisites: ['multiplication', 'subtraction-within-20'],
      representationLevels: ['abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'abstract',
            params: { maxItems: 3, maxPrice: 5 },
          },
          {
            minCoordinate: 0.5,
            representationLevel: 'abstract',
            params: { maxItems: 5, maxPrice: 9 },
          },
        ],
      },
    },

    // -------------------------------------------------------------------------
    // decimal-comparison — generator-backed node (graphVersion 0.3.0)
    // Prerequisites: place-value.
    // Skill: compare two decimals and tap the larger one (the 'compare'
    // interaction) — exercises the classic more-digits-but-smaller misconception.
    //
    // Difficulty band ladder (shipped defaults — calibrated by pedagogy-pass):
    //   Band 0 (pictorial) [0.00, 0.50) — compare; maxWhole 5
    //   Band 1 (abstract)  [0.50, 1.00+) — compare; maxWhole 9
    //
    // `params` shape: { maxWhole: number }
    // Only the decimal-comparison generator narrows this (core never inspects it).
    // -------------------------------------------------------------------------
    {
      id: 'decimal-comparison',
      prerequisites: ['place-value'],
      representationLevels: ['pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          {
            minCoordinate: 0,
            representationLevel: 'pictorial',
            params: { maxWhole: 5 },
          },
          {
            minCoordinate: 0.5,
            representationLevel: 'abstract',
            params: { maxWhole: 9 },
          },
        ],
      },
    },
  ],
} as const;
