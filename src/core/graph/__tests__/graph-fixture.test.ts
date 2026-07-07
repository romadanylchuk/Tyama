/**
 * graph-fixture.test.ts — Phase 7 end-to-end tests for the 6-node fixture.
 *
 * Verifies:
 *   - graphVersion === '0.2.1' (graph-content axis bump).
 *   - The three stage-05 nodes (number-bonds, multiplication, fraction-simplification)
 *     exist with the expected prerequisites, representationLevels, and band ladders.
 *   - The two foundation nodes (addition-within-20, unknown-as-missing-addend)
 *     exist with the expected prerequisites, representationLevels, and band ladders.
 *   - Each node's band ladder starts at minCoordinate 0 and is strictly ascending.
 *   - validateGraph(GRAPH_FIXTURE) passes (acyclic DAG, valid bands, unique ids).
 *   - assertEveryGeneratorHasNode(GRAPH_FIXTURE, GENERATORS) passes (all 6 generator
 *     keys have matching nodes — every fixture node is now generator-backed).
 *   - resolveAvailability reports 6 'available' nodes (0 'coming-soon').
 *   - End-to-end per-generator: loadGraph → selectBand → getGenerator(slug).generate(...)
 *     produces correct tasks for each of the 5 non-fruit-equations generators.
 *   - Two version axes: DB_SCHEMA_VERSION / user_version is NEVER touched here.
 */

import { GRAPH_FIXTURE } from '../graph-fixture';
import { validateGraph } from '../validate-graph';
import { loadGraph } from '../load-graph';
import { selectBand } from '@/core/difficulty/select-band';
import {
  GENERATORS,
  assertEveryGeneratorHasNode,
  resolveAvailability,
} from '../../generators/registry';
import { createSeededRng } from '../../rng/seeded-rng';
import { canonicalize, canonicalizeFraction } from '@/core/canonical/canonical-number';
import type { DifficultyParams } from '../../types';

// Suppress console.warn from loadGraph fixture guard.
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// graphVersion bump
// ---------------------------------------------------------------------------

describe('GRAPH_FIXTURE — graphVersion', () => {
  it('graphVersion is "0.2.1" (graph-content axis, not DB schema)', () => {
    expect(GRAPH_FIXTURE.graphVersion).toBe('0.2.1');
  });

  it('fixture flag is still true (smoke-test fixture, not MVP catalog)', () => {
    expect(GRAPH_FIXTURE.fixture).toBe(true);
  });

  it('has 6 nodes total', () => {
    expect(GRAPH_FIXTURE.nodes).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// New node: number-bonds
// ---------------------------------------------------------------------------

describe('GRAPH_FIXTURE — number-bonds node', () => {
  const getNode = () => GRAPH_FIXTURE.nodes.find((n) => n.id === 'number-bonds');

  it('exists in the fixture', () => {
    expect(getNode()).toBeDefined();
  });

  it('has prerequisite: addition-within-20', () => {
    const node = getNode()!;
    expect(node.prerequisites).toContain('addition-within-20');
    expect(node.prerequisites).toHaveLength(1);
  });

  it('has representationLevels: concrete, pictorial, abstract', () => {
    const node = getNode()!;
    expect(node.representationLevels).toEqual(['concrete', 'pictorial', 'abstract']);
  });

  it('has 4 difficulty bands (3 literal-slot + 1 random-slot mastery band)', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands).toHaveLength(4);
  });

  it('first band starts at minCoordinate 0', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands[0].minCoordinate).toBe(0);
  });

  it('bands are strictly ascending by minCoordinate', () => {
    const node = getNode()!;
    const bands = node.difficultyHooks.bands;
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].minCoordinate).toBeGreaterThan(bands[i - 1].minCoordinate);
    }
  });

  it('each band carries wholeMax and missingSlot params', () => {
    const node = getNode()!;
    for (const band of node.difficultyHooks.bands) {
      const params = band.params as { wholeMax: number; missingSlot: string };
      expect(typeof params.wholeMax).toBe('number');
      expect(['partA', 'partB', 'whole', 'random']).toContain(params.missingSlot);
    }
  });

  it('the top band (mastery) carries wholeMax 50 and missingSlot "random"', () => {
    const node = getNode()!;
    const topBand = node.difficultyHooks.bands[node.difficultyHooks.bands.length - 1];
    expect(topBand.minCoordinate).toBe(0.85);
    expect(topBand.representationLevel).toBe('abstract');
    const params = topBand.params as { wholeMax: number; missingSlot: string };
    expect(params.wholeMax).toBe(50);
    expect(params.missingSlot).toBe('random');
  });
});

// ---------------------------------------------------------------------------
// New node: multiplication
// ---------------------------------------------------------------------------

describe('GRAPH_FIXTURE — multiplication node', () => {
  const getNode = () => GRAPH_FIXTURE.nodes.find((n) => n.id === 'multiplication');

  it('exists in the fixture', () => {
    expect(getNode()).toBeDefined();
  });

  it('has prerequisite: number-bonds', () => {
    const node = getNode()!;
    expect(node.prerequisites).toContain('number-bonds');
    expect(node.prerequisites).toHaveLength(1);
  });

  it('has representationLevels: abstract only (no CPA variation)', () => {
    const node = getNode()!;
    expect(node.representationLevels).toEqual(['abstract']);
  });

  it('has 4 difficulty bands (3 "product" form + 1 "missing-factor" form)', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands).toHaveLength(4);
  });

  it('first band starts at minCoordinate 0', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands[0].minCoordinate).toBe(0);
  });

  it('bands are strictly ascending by minCoordinate', () => {
    const node = getNode()!;
    const bands = node.difficultyHooks.bands;
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].minCoordinate).toBeGreaterThan(bands[i - 1].minCoordinate);
    }
  });

  it('the first 3 ("product" form) bands carry aMax and bMax params', () => {
    const node = getNode()!;
    for (const band of node.difficultyHooks.bands.slice(0, 3)) {
      const params = band.params as { aMax: number; bMax: number };
      expect(typeof params.aMax).toBe('number');
      expect(typeof params.bMax).toBe('number');
    }
  });

  it('the top band carries form "missing-factor" and a tableMax param (division readiness)', () => {
    const node = getNode()!;
    const topBand = node.difficultyHooks.bands[node.difficultyHooks.bands.length - 1];
    const params = topBand.params as { form: string; tableMax: number };
    expect(params.form).toBe('missing-factor');
    expect(typeof params.tableMax).toBe('number');
  });

  it('has a per-node mastery.targetMs override (config-as-data exemplar)', () => {
    const node = getNode()!;
    const mastery = node.difficultyHooks.mastery as { targetMs: number } | undefined;
    expect(mastery).toBeDefined();
    expect(typeof mastery!.targetMs).toBe('number');
    expect(mastery!.targetMs).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// New node: fraction-simplification
// ---------------------------------------------------------------------------

describe('GRAPH_FIXTURE — fraction-simplification node', () => {
  const getNode = () => GRAPH_FIXTURE.nodes.find((n) => n.id === 'fraction-simplification');

  it('exists in the fixture', () => {
    expect(getNode()).toBeDefined();
  });

  it('has prerequisite: fruit-equations', () => {
    const node = getNode()!;
    expect(node.prerequisites).toContain('fruit-equations');
    expect(node.prerequisites).toHaveLength(1);
  });

  it('has representationLevels: concrete, pictorial, abstract', () => {
    const node = getNode()!;
    expect(node.representationLevels).toEqual(['concrete', 'pictorial', 'abstract']);
  });

  it('has 3 difficulty bands', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands).toHaveLength(3);
  });

  it('first band starts at minCoordinate 0', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands[0].minCoordinate).toBe(0);
  });

  it('bands are strictly ascending by minCoordinate', () => {
    const node = getNode()!;
    const bands = node.difficultyHooks.bands;
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].minCoordinate).toBeGreaterThan(bands[i - 1].minCoordinate);
    }
  });

  it('each band carries maxDenominator and maxFactor params', () => {
    const node = getNode()!;
    for (const band of node.difficultyHooks.bands) {
      const params = band.params as { maxDenominator: number; maxFactor: number };
      expect(typeof params.maxDenominator).toBe('number');
      expect(typeof params.maxFactor).toBe('number');
    }
  });

  it('middle band (gcd-scaffold) starts at minCoordinate 0.4, is pictorial, and sets includeGcdStep', () => {
    const node = getNode()!;
    const gcdBand = node.difficultyHooks.bands[1];
    expect(gcdBand.minCoordinate).toBe(0.4);
    expect(gcdBand.representationLevel).toBe('pictorial');
    const params = gcdBand.params as { includeGcdStep?: boolean };
    expect(params.includeGcdStep).toBe(true);
  });

  it('concrete and abstract bands do NOT set includeGcdStep (default two-step behavior)', () => {
    const node = getNode()!;
    const concreteParams = node.difficultyHooks.bands[0].params as { includeGcdStep?: boolean };
    const abstractParams = node.difficultyHooks.bands[2].params as { includeGcdStep?: boolean };
    expect(concreteParams.includeGcdStep).toBeUndefined();
    expect(abstractParams.includeGcdStep).toBeUndefined();
  });

  it('last band (abstract) starts at minCoordinate 0.7', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands[2].minCoordinate).toBe(0.7);
    expect(node.difficultyHooks.bands[2].representationLevel).toBe('abstract');
  });
});

// ---------------------------------------------------------------------------
// New node: addition-within-20
// ---------------------------------------------------------------------------

describe('GRAPH_FIXTURE — addition-within-20 node', () => {
  const getNode = () => GRAPH_FIXTURE.nodes.find((n) => n.id === 'addition-within-20');

  it('exists in the fixture', () => {
    expect(getNode()).toBeDefined();
  });

  it('is a root node (no prerequisites)', () => {
    const node = getNode()!;
    expect(node.prerequisites).toHaveLength(0);
  });

  it('has representationLevels: concrete, pictorial, abstract', () => {
    const node = getNode()!;
    expect(node.representationLevels).toEqual(['concrete', 'pictorial', 'abstract']);
  });

  it('has 3 difficulty bands', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands).toHaveLength(3);
  });

  it('first band starts at minCoordinate 0', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands[0].minCoordinate).toBe(0);
  });

  it('bands are strictly ascending by minCoordinate', () => {
    const node = getNode()!;
    const bands = node.difficultyHooks.bands;
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].minCoordinate).toBeGreaterThan(bands[i - 1].minCoordinate);
    }
  });

  it('each band carries a maxTotal param', () => {
    const node = getNode()!;
    for (const band of node.difficultyHooks.bands) {
      const params = band.params as { maxTotal: number };
      expect(typeof params.maxTotal).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// New node: unknown-as-missing-addend
// ---------------------------------------------------------------------------

describe('GRAPH_FIXTURE — unknown-as-missing-addend node', () => {
  const getNode = () => GRAPH_FIXTURE.nodes.find((n) => n.id === 'unknown-as-missing-addend');

  it('exists in the fixture', () => {
    expect(getNode()).toBeDefined();
  });

  it('has prerequisite: addition-within-20', () => {
    const node = getNode()!;
    expect(node.prerequisites).toContain('addition-within-20');
    expect(node.prerequisites).toHaveLength(1);
  });

  it('has representationLevels: concrete, pictorial, abstract', () => {
    const node = getNode()!;
    expect(node.representationLevels).toEqual(['concrete', 'pictorial', 'abstract']);
  });

  it('has 3 difficulty bands', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands).toHaveLength(3);
  });

  it('first band starts at minCoordinate 0', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands[0].minCoordinate).toBe(0);
  });

  it('bands are strictly ascending by minCoordinate', () => {
    const node = getNode()!;
    const bands = node.difficultyHooks.bands;
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].minCoordinate).toBeGreaterThan(bands[i - 1].minCoordinate);
    }
  });

  it('each band carries a maxTotal param', () => {
    const node = getNode()!;
    for (const band of node.difficultyHooks.bands) {
      const params = band.params as { maxTotal: number };
      expect(typeof params.maxTotal).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Graph integrity: validateGraph passes on the updated fixture
// ---------------------------------------------------------------------------

describe('validateGraph(GRAPH_FIXTURE)', () => {
  it('passes without throwing (DAG acyclic, valid bands, unique ids, no dangling prereqs)', () => {
    expect(() => validateGraph(GRAPH_FIXTURE)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Registry alignment: assertEveryGeneratorHasNode
// ---------------------------------------------------------------------------

describe('assertEveryGeneratorHasNode(GRAPH_FIXTURE, GENERATORS)', () => {
  it('passes without throwing (all 6 generator keys have matching nodes)', () => {
    expect(() => assertEveryGeneratorHasNode(GRAPH_FIXTURE, GENERATORS)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Availability: all 6 nodes available (0 coming-soon)
// ---------------------------------------------------------------------------

describe('resolveAvailability(GRAPH_FIXTURE)', () => {
  it('marks all six generator-backed nodes as available', () => {
    const availability = resolveAvailability(GRAPH_FIXTURE);
    const generatorNodes = [
      'fruit-equations',
      'number-bonds',
      'multiplication',
      'fraction-simplification',
      'addition-within-20',
      'unknown-as-missing-addend',
    ];
    for (const nodeId of generatorNodes) {
      const entry = availability.find((a) => a.nodeId === nodeId);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('available');
    }
  });

  it('returns 6 entries total (one per node)', () => {
    const availability = resolveAvailability(GRAPH_FIXTURE);
    expect(availability).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: loadGraph → selectBand → getGenerator → generate (number-bonds)
// ---------------------------------------------------------------------------

describe('End-to-end: number-bonds generator', () => {
  it('loadGraph → selectBand → generate produces a valid integer-step task', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'number-bonds')!;
    const band = selectBand(0.0, node.difficultyHooks.bands);
    const gen = GENERATORS['number-bonds'];
    expect(gen).toBeDefined();

    const rng = createSeededRng(42);
    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0,
      params: band.params,
    };
    const task = gen.generate(difficulty, rng);

    // One integer step
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
    expect(task.steps[0].skillNode).toBe('number-bonds');

    // Expected is canonicalize of some integer
    const parsed = parseInt(task.steps[0].expected, 10);
    expect(isNaN(parsed)).toBe(false);
    expect(task.steps[0].expected).toBe(canonicalize(parsed));

    // Solution equals expected (single-step task)
    expect(task.solution).toBe(task.steps[0].expected);
  });

  it('same seed + difficulty → identical task (deterministic)', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'number-bonds')!;
    const band = selectBand(0.5, node.difficultyHooks.bands);
    const gen = GENERATORS['number-bonds'];

    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0.5,
      params: band.params,
    };

    const task1 = gen.generate(difficulty, createSeededRng(99));
    const task2 = gen.generate(difficulty, createSeededRng(99));
    expect(task1.steps[0].expected).toBe(task2.steps[0].expected);
    expect(task1.solution).toBe(task2.solution);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: loadGraph → selectBand → getGenerator → generate (multiplication)
// ---------------------------------------------------------------------------

describe('End-to-end: multiplication generator', () => {
  it('loadGraph → selectBand → generate produces a valid integer-step task', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'multiplication')!;
    const band = selectBand(0.0, node.difficultyHooks.bands);
    const gen = GENERATORS['multiplication'];
    expect(gen).toBeDefined();

    const rng = createSeededRng(7);
    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0,
      params: band.params,
    };
    const task = gen.generate(difficulty, rng);

    // One integer step
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
    expect(task.steps[0].skillNode).toBe('multiplication');

    // Expected is canonicalize of a × b product
    const parsed = parseInt(task.steps[0].expected, 10);
    expect(isNaN(parsed)).toBe(false);
    expect(task.steps[0].expected).toBe(canonicalize(parsed));
    expect(parsed).toBeGreaterThanOrEqual(1);

    // Solution equals expected
    expect(task.solution).toBe(task.steps[0].expected);
  });

  it('same seed + difficulty → identical task (deterministic)', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'multiplication')!;
    const band = selectBand(0.8, node.difficultyHooks.bands);
    const gen = GENERATORS['multiplication'];

    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 1,
      params: band.params,
    };

    const task1 = gen.generate(difficulty, createSeededRng(123));
    const task2 = gen.generate(difficulty, createSeededRng(123));
    expect(task1.steps[0].expected).toBe(task2.steps[0].expected);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: loadGraph → selectBand → getGenerator → generate (fraction-simplification)
// ---------------------------------------------------------------------------

describe('End-to-end: fraction-simplification generator', () => {
  it('loadGraph → selectBand → generate produces two integer-step task with canonicalizeFraction solution', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fraction-simplification')!;
    const band = selectBand(0.0, node.difficultyHooks.bands);
    const gen = GENERATORS['fraction-simplification'];
    expect(gen).toBeDefined();

    const rng = createSeededRng(77);
    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0,
      params: band.params,
    };
    const task = gen.generate(difficulty, rng);

    // Two integer steps (numerator p, denominator q)
    expect(task.steps).toHaveLength(2);
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
    expect(task.steps[1].normalizationPolicy.numberClass).toBe('integer');
    expect(task.steps[0].skillNode).toBe('fraction-simplification');
    expect(task.steps[1].skillNode).toBe('fraction-simplification');

    // Parse p and q from the steps
    const p = parseInt(task.steps[0].expected, 10);
    const q = parseInt(task.steps[1].expected, 10);
    expect(isNaN(p)).toBe(false);
    expect(isNaN(q)).toBe(false);
    expect(p).toBeGreaterThanOrEqual(1);
    expect(q).toBeGreaterThanOrEqual(2);

    // task.solution flows through canonicalizeFraction (PROVES D1)
    expect(task.solution).toBe(canonicalizeFraction(p, q));
    expect(task.solution).toContain('/');

    // Steps are canonicalize(p) and canonicalize(q)
    expect(task.steps[0].expected).toBe(canonicalize(p));
    expect(task.steps[1].expected).toBe(canonicalize(q));
  });

  it('same seed + difficulty → identical task (deterministic)', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fraction-simplification')!;
    const band = selectBand(0.8, node.difficultyHooks.bands);
    const gen = GENERATORS['fraction-simplification'];

    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 1,
      params: band.params,
    };

    const task1 = gen.generate(difficulty, createSeededRng(55));
    const task2 = gen.generate(difficulty, createSeededRng(55));
    expect(task1.steps[0].expected).toBe(task2.steps[0].expected);
    expect(task1.steps[1].expected).toBe(task2.steps[1].expected);
    expect(task1.solution).toBe(task2.solution);
  });

  it('presented fraction is genuinely non-reduced (k > 1 applied)', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fraction-simplification')!;
    const band = selectBand(0.0, node.difficultyHooks.bands);
    const gen = GENERATORS['fraction-simplification'];

    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0,
      params: band.params,
    };

    // Across 10 different seeds, the presented problem should always be non-reduced
    for (let seed = 0; seed < 10; seed++) {
      const task = gen.generate(difficulty, createSeededRng(seed));
      const p = parseInt(task.steps[0].expected, 10);
      const q = parseInt(task.steps[1].expected, 10);
      // The presented fraction (from problem vars) should be divisible by k > 1
      const vars = task.problem.prompt.vars as { num: number; den: number };
      expect(vars.num).toBeGreaterThan(p); // presented numerator = p*k > p
      expect(vars.den).toBeGreaterThan(q); // presented denominator = q*k > q
      expect(vars.num % p).toBe(0);
      expect(vars.den % q).toBe(0);
      // Both scale by the same factor
      expect(Math.round(vars.num / p)).toBe(Math.round(vars.den / q));
    }
  });

  it('gcd-scaffold band (coordinate 0.5) produces a THREE-step task: gcd, numerator, denominator', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fraction-simplification')!;
    const band = selectBand(0.5, node.difficultyHooks.bands);
    expect(band.representationLevel).toBe('pictorial');
    const gen = GENERATORS['fraction-simplification'];

    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0.5,
      params: band.params,
    };

    const task = gen.generate(difficulty, createSeededRng(33));

    expect(task.steps).toHaveLength(3);
    const gcdStep = task.steps[0];
    const numeratorStep = task.steps[1];
    const denominatorStep = task.steps[2];

    const k = parseInt(gcdStep.expected, 10);
    const p = parseInt(numeratorStep.expected, 10);
    const q = parseInt(denominatorStep.expected, 10);
    const vars = task.problem.prompt.vars as { num: number; den: number };

    // gcd(presentedNum, presentedDen) === k, and n = p*k, d = q*k.
    expect(vars.num).toBe(p * k);
    expect(vars.den).toBe(q * k);
    expect(task.solution).toBe(canonicalizeFraction(p, q));
  });
});

// ---------------------------------------------------------------------------
// End-to-end: loadGraph → selectBand → getGenerator → generate (addition-within-20)
// ---------------------------------------------------------------------------

describe('End-to-end: addition-within-20 generator', () => {
  it('loadGraph → selectBand → generate produces a valid integer-step task', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'addition-within-20')!;
    const band = selectBand(0.0, node.difficultyHooks.bands);
    const gen = GENERATORS['addition-within-20'];
    expect(gen).toBeDefined();

    const rng = createSeededRng(11);
    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0,
      params: band.params,
    };
    const task = gen.generate(difficulty, rng);

    // One integer step
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
    expect(task.steps[0].skillNode).toBe('addition-within-20');

    // Expected is canonicalize of the drawn sum
    const parsed = parseInt(task.steps[0].expected, 10);
    expect(isNaN(parsed)).toBe(false);
    expect(task.steps[0].expected).toBe(canonicalize(parsed));

    // Solution equals expected (single-step task)
    expect(task.solution).toBe(task.steps[0].expected);
  });

  it('same seed + difficulty → identical task (deterministic)', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'addition-within-20')!;
    const band = selectBand(0.5, node.difficultyHooks.bands);
    const gen = GENERATORS['addition-within-20'];

    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0.5,
      params: band.params,
    };

    const task1 = gen.generate(difficulty, createSeededRng(88));
    const task2 = gen.generate(difficulty, createSeededRng(88));
    expect(task1.steps[0].expected).toBe(task2.steps[0].expected);
    expect(task1.solution).toBe(task2.solution);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: loadGraph → selectBand → getGenerator → generate (unknown-as-missing-addend)
// ---------------------------------------------------------------------------

describe('End-to-end: unknown-as-missing-addend generator', () => {
  it('loadGraph → selectBand → generate produces a valid integer-step task', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'unknown-as-missing-addend')!;
    const band = selectBand(0.0, node.difficultyHooks.bands);
    const gen = GENERATORS['unknown-as-missing-addend'];
    expect(gen).toBeDefined();

    const rng = createSeededRng(22);
    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 0,
      params: band.params,
    };
    const task = gen.generate(difficulty, rng);

    // One integer step
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0].normalizationPolicy.numberClass).toBe('integer');
    expect(task.steps[0].skillNode).toBe('unknown-as-missing-addend');

    // Expected is canonicalize of the drawn missing addend
    const parsed = parseInt(task.steps[0].expected, 10);
    expect(isNaN(parsed)).toBe(false);
    expect(task.steps[0].expected).toBe(canonicalize(parsed));

    // Solution equals expected (single-step task)
    expect(task.solution).toBe(task.steps[0].expected);
  });

  it('same seed + difficulty → identical task (deterministic)', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'unknown-as-missing-addend')!;
    const band = selectBand(0.8, node.difficultyHooks.bands);
    const gen = GENERATORS['unknown-as-missing-addend'];

    const difficulty: DifficultyParams = {
      representationLevel: band.representationLevel,
      elicitFromMastery: 1,
      params: band.params,
    };

    const task1 = gen.generate(difficulty, createSeededRng(66));
    const task2 = gen.generate(difficulty, createSeededRng(66));
    expect(task1.steps[0].expected).toBe(task2.steps[0].expected);
  });
});

// ---------------------------------------------------------------------------
// Band coverage: EVERY band of EVERY generator-backed node parses under the
// real loadGraph() → selectBand() → generate() pipeline.
//
// The per-generator suites above spot-check only 1-2 coordinates each, which
// (given the half-open band ladder) does NOT guarantee every band index is
// ever selected — e.g. coordinate 0.8 selects the multiplication band at
// minCoordinate 0.7, never reaching the top band (0.85, 'missing-factor').
// The per-generator unit test files DO cover the 'missing-factor' and
// 'random'-slot param SHAPES directly (hand-built Band literals), but that
// does not prove selectBand() ever resolves to them FROM THE ACTUAL FIXTURE.
// This suite closes that gap: for each generator-backed node, select each
// band by its own minCoordinate (guaranteeing that exact band is chosen —
// see the half-open ladder rule in select-band.ts) and confirm
// GENERATORS[node].generate(...) runs to completion without throwing.
// ---------------------------------------------------------------------------

describe('Band coverage — every band of every generator-backed node parses (full pipeline)', () => {
  const GENERATOR_BACKED_NODE_IDS = [
    'addition-within-20',
    'unknown-as-missing-addend',
    'fruit-equations',
    'number-bonds',
    'multiplication',
    'fraction-simplification',
  ] as const;

  it.each(GENERATOR_BACKED_NODE_IDS)('%s: every band index selects and generates without throwing', (nodeId) => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === nodeId)!;
    const gen = GENERATORS[nodeId];
    expect(gen).toBeDefined();

    node.difficultyHooks.bands.forEach((band, index) => {
      // Selecting exactly at the band's own minCoordinate always resolves to
      // that band (half-open ladder: "exact minCoordinate hit -> that band").
      const selected = selectBand(band.minCoordinate, node.difficultyHooks.bands);
      expect(selected).toBe(band); // same reference: confirms the RIGHT band index was reached.

      const difficulty: DifficultyParams = {
        representationLevel: selected.representationLevel,
        elicitFromMastery: 0.5,
        params: selected.params,
      };

      let task;
      expect(() => {
        task = gen.generate(difficulty, createSeededRng(1000 + index));
      }).not.toThrow();
      expect(task!.steps.length).toBeGreaterThan(0);
      expect(task!.skillNode).toBe(nodeId);
    });
  });

  it('number-bonds top band (0.85, wholeMax 50, missingSlot "random") is reached and generates', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'number-bonds')!;
    const topBand = node.difficultyHooks.bands[node.difficultyHooks.bands.length - 1];
    const selected = selectBand(0.9, node.difficultyHooks.bands);
    expect(selected).toBe(topBand);

    const gen = GENERATORS['number-bonds'];
    const difficulty: DifficultyParams = {
      representationLevel: selected.representationLevel,
      elicitFromMastery: 1,
      params: selected.params,
    };
    const task = gen.generate(difficulty, createSeededRng(2024));
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0].skillNode).toBe('number-bonds');
  });

  it('multiplication top band (0.85, form "missing-factor", tableMax 12) is reached and generates', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'multiplication')!;
    const topBand = node.difficultyHooks.bands[node.difficultyHooks.bands.length - 1];
    const selected = selectBand(0.9, node.difficultyHooks.bands);
    expect(selected).toBe(topBand);

    const gen = GENERATORS['multiplication'];
    const difficulty: DifficultyParams = {
      representationLevel: selected.representationLevel,
      elicitFromMastery: 1,
      params: selected.params,
    };
    const task = gen.generate(difficulty, createSeededRng(4048));
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0].skillNode).toBe('multiplication');
  });
});

// ---------------------------------------------------------------------------
// Two version axes: DB_SCHEMA_VERSION untouched
// ---------------------------------------------------------------------------

describe('Two version axes', () => {
  it('GRAPH_FIXTURE.graphVersion is on the graph-content axis (string semver)', () => {
    // Structural test: graphVersion is a semver string, not a DB integer
    expect(typeof GRAPH_FIXTURE.graphVersion).toBe('string');
    expect(GRAPH_FIXTURE.graphVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
