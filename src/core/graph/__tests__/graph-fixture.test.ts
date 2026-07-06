/**
 * graph-fixture.test.ts — Phase 7 end-to-end tests for the 6-node fixture.
 *
 * Verifies:
 *   - graphVersion === '0.2.0' (graph-content axis bump).
 *   - The three new nodes (number-bonds, multiplication, fraction-simplification)
 *     exist with the expected prerequisites, representationLevels, and band ladders.
 *   - Each new node's band ladder starts at minCoordinate 0 and is strictly ascending.
 *   - validateGraph(GRAPH_FIXTURE) passes (acyclic DAG, valid bands, unique ids).
 *   - assertEveryGeneratorHasNode(GRAPH_FIXTURE, GENERATORS) passes (all 4 generator
 *     keys have matching nodes; the 2 generator-less nodes stay 'coming-soon').
 *   - resolveAvailability reports 4 'available' and 2 'coming-soon' nodes.
 *   - End-to-end per-generator: loadGraph → selectBand → getGenerator(slug).generate(...)
 *     produces correct tasks for each of the 3 new generators.
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
  it('graphVersion is "0.2.0" (graph-content axis, not DB schema)', () => {
    expect(GRAPH_FIXTURE.graphVersion).toBe('0.2.0');
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

  it('each band carries wholeMax and missingSlot params', () => {
    const node = getNode()!;
    for (const band of node.difficultyHooks.bands) {
      const params = band.params as { wholeMax: number; missingSlot: string };
      expect(typeof params.wholeMax).toBe('number');
      expect(['partA', 'partB', 'whole']).toContain(params.missingSlot);
    }
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

  it('each band carries aMax and bMax params', () => {
    const node = getNode()!;
    for (const band of node.difficultyHooks.bands) {
      const params = band.params as { aMax: number; bMax: number };
      expect(typeof params.aMax).toBe('number');
      expect(typeof params.bMax).toBe('number');
    }
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

  it('has representationLevels: concrete, abstract', () => {
    const node = getNode()!;
    expect(node.representationLevels).toEqual(['concrete', 'abstract']);
  });

  it('has 2 difficulty bands', () => {
    const node = getNode()!;
    expect(node.difficultyHooks.bands).toHaveLength(2);
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
  it('passes without throwing (all 4 generator keys have matching nodes)', () => {
    expect(() => assertEveryGeneratorHasNode(GRAPH_FIXTURE, GENERATORS)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Availability: 4 available, 2 coming-soon
// ---------------------------------------------------------------------------

describe('resolveAvailability(GRAPH_FIXTURE)', () => {
  it('marks all four generator-backed nodes as available', () => {
    const availability = resolveAvailability(GRAPH_FIXTURE);
    const generatorNodes = [
      'fruit-equations',
      'number-bonds',
      'multiplication',
      'fraction-simplification',
    ];
    for (const nodeId of generatorNodes) {
      const entry = availability.find((a) => a.nodeId === nodeId);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('available');
    }
  });

  it('marks the two generator-less nodes as coming-soon', () => {
    const availability = resolveAvailability(GRAPH_FIXTURE);
    const comingSoonNodes = ['addition-within-20', 'unknown-as-missing-addend'];
    for (const nodeId of comingSoonNodes) {
      const entry = availability.find((a) => a.nodeId === nodeId);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('coming-soon');
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
