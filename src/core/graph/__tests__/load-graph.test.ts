/**
 * load-graph.test.ts — Tests for `loadGraph()` and the GRAPH_FIXTURE asset.
 *
 * Verifies:
 *   - `loadGraph()` returns a valid `GraphDefinition` with `graphVersion '0.2.1'`.
 *   - The returned graph has `fixture: true`.
 *   - All six expected nodes are present with correct IDs and prerequisite edges.
 *   - The fixture flag triggers a `console.warn` (fixture guard).
 *   - The graph passes `validateGraph()` without error.
 */

import { loadGraph } from '../load-graph';
import { validateGraph } from '../validate-graph';

// Suppress console.warn for the fixture guard during tests.
// We test the warn separately in the fixture-guard test.
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Basic shape
// ---------------------------------------------------------------------------

describe('loadGraph() — basic shape', () => {
  it('returns a GraphDefinition with graphVersion "0.2.1"', () => {
    const graph = loadGraph();
    expect(graph.graphVersion).toBe('0.2.1');
  });

  it('returns a graph with fixture: true', () => {
    const graph = loadGraph();
    expect(graph.fixture).toBe(true);
  });

  it('returns exactly 6 nodes', () => {
    const graph = loadGraph();
    expect(graph.nodes).toHaveLength(6);
  });

  it('nodes array is non-empty', () => {
    const graph = loadGraph();
    expect(graph.nodes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Node IDs and prerequisite structure
// ---------------------------------------------------------------------------

describe('loadGraph() — node IDs', () => {
  it('includes addition-within-20 as a root node', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'addition-within-20');
    expect(node).toBeDefined();
    expect(node!.prerequisites).toHaveLength(0);
  });

  it('includes unknown-as-missing-addend with prerequisite addition-within-20', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'unknown-as-missing-addend');
    expect(node).toBeDefined();
    expect(node!.prerequisites).toContain('addition-within-20');
    expect(node!.prerequisites).toHaveLength(1);
  });

  it('includes fruit-equations with both prerequisites', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fruit-equations');
    expect(node).toBeDefined();
    expect(node!.prerequisites).toContain('addition-within-20');
    expect(node!.prerequisites).toContain('unknown-as-missing-addend');
    expect(node!.prerequisites).toHaveLength(2);
  });

  it('includes number-bonds with prerequisite addition-within-20', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'number-bonds');
    expect(node).toBeDefined();
    expect(node!.prerequisites).toContain('addition-within-20');
    expect(node!.prerequisites).toHaveLength(1);
  });

  it('includes multiplication with prerequisite number-bonds', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'multiplication');
    expect(node).toBeDefined();
    expect(node!.prerequisites).toContain('number-bonds');
    expect(node!.prerequisites).toHaveLength(1);
  });

  it('includes fraction-simplification with prerequisite fruit-equations', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fraction-simplification');
    expect(node).toBeDefined();
    expect(node!.prerequisites).toContain('fruit-equations');
    expect(node!.prerequisites).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// fruit-equations band ladder (the live generator node)
// ---------------------------------------------------------------------------

describe('loadGraph() — fruit-equations band ladder', () => {
  it('fruit-equations has 4 difficulty bands (incl. the high-mastery cherry-tier band)', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fruit-equations');
    expect(node!.difficultyHooks.bands).toHaveLength(4);
  });

  it('fruit-equations bands are ascending by minCoordinate', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fruit-equations')!;
    const bands = node.difficultyHooks.bands;
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].minCoordinate).toBeGreaterThan(bands[i - 1].minCoordinate);
    }
  });

  it('fruit-equations lowest band starts at minCoordinate 0', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fruit-equations')!;
    expect(node.difficultyHooks.bands[0].minCoordinate).toBe(0);
  });

  it('fruit-equations bands carry opaque params (unknowns/range/negatives shape)', () => {
    const graph = loadGraph();
    const node = graph.nodes.find((n) => n.id === 'fruit-equations')!;
    for (const band of node.difficultyHooks.bands) {
      const params = band.params as { unknowns: number; range: number; negatives: boolean };
      expect(typeof params.unknowns).toBe('number');
      expect(typeof params.range).toBe('number');
      expect(typeof params.negatives).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// Fixture guard (console.warn)
// ---------------------------------------------------------------------------

describe('loadGraph() — fixture guard', () => {
  it('emits a console.warn when the graph has fixture: true', () => {
    loadGraph();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[loadGraph]');
    expect(warnSpy.mock.calls[0][0]).toContain('SMOKE-TEST FIXTURE');
  });

  it('warn message includes the graphVersion', () => {
    loadGraph();
    expect(warnSpy.mock.calls[0][0]).toContain('0.2.1');
  });
});

// ---------------------------------------------------------------------------
// validateGraph passes on the fixture
// ---------------------------------------------------------------------------

describe('loadGraph() + validateGraph()', () => {
  it('fixture passes validateGraph without throwing', () => {
    const graph = loadGraph();
    expect(() => validateGraph(graph)).not.toThrow();
  });
});
