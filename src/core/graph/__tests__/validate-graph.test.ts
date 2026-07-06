/**
 * validate-graph.test.ts — Tests for `validateGraph()`.
 *
 * Verifies:
 *   - Valid graphs (including the fixture) pass without throwing.
 *   - Cyclic graphs are rejected with a `GraphValidationError` listing the cycle.
 *   - Dangling prerequisite references are rejected.
 *   - Duplicate node IDs are rejected.
 *   - Empty node lists are rejected.
 *   - Ascending band-ladder invariant is enforced per node.
 *   - Multiple violations are collected before throwing (not fail-fast).
 */

import type { GraphDefinition } from '@/core/types';
import { validateGraph, GraphValidationError } from '../validate-graph';
import { loadGraph } from '../load-graph';

// Suppress console.warn from loadGraph fixture guard in these tests.
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: build a minimal valid GraphDefinition for parametric tests
// ---------------------------------------------------------------------------

function makeMinimalGraph(): GraphDefinition {
  return {
    graphVersion: '0.1.0',
    nodes: [
      {
        id: 'root-node',
        prerequisites: [],
        representationLevels: ['concrete'],
        difficultyHooks: {
          bands: [
            { minCoordinate: 0, representationLevel: 'concrete', params: {} },
          ],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Valid graphs
// ---------------------------------------------------------------------------

describe('validateGraph() — valid graphs pass', () => {
  it('accepts the loaded fixture graph', () => {
    const graph = loadGraph();
    expect(() => validateGraph(graph)).not.toThrow();
  });

  it('accepts a minimal single-node graph', () => {
    const graph = makeMinimalGraph();
    expect(() => validateGraph(graph)).not.toThrow();
  });

  it('accepts a linear A → B → C graph (no cycles)', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'node-a',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'node-b',
          prerequisites: ['node-a'],
          representationLevels: ['pictorial'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'pictorial', params: {} }],
          },
        },
        {
          id: 'node-c',
          prerequisites: ['node-b'],
          representationLevels: ['abstract'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'abstract', params: {} }],
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).not.toThrow();
  });

  it('accepts a diamond-shaped DAG (shared prerequisite)', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'root',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'left',
          prerequisites: ['root'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'right',
          prerequisites: ['root'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'tip',
          prerequisites: ['left', 'right'],
          representationLevels: ['abstract'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'abstract', params: {} }],
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Empty graph
// ---------------------------------------------------------------------------

describe('validateGraph() — empty node list', () => {
  it('throws GraphValidationError for an empty nodes array', () => {
    const graph: GraphDefinition = { graphVersion: '0.1.0', nodes: [] };
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it('error message mentions no-nodes violation', () => {
    const graph: GraphDefinition = { graphVersion: '0.1.0', nodes: [] };
    try {
      validateGraph(graph);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GraphValidationError);
      const gve = err as GraphValidationError;
      expect(gve.violations).toHaveLength(1);
      expect(gve.violations[0]).toMatch(/no nodes/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

describe('validateGraph() — cycle detection', () => {
  it('rejects a self-loop (A → A)', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'node-a',
          prerequisites: ['node-a'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
      ],
    };
    // Note: 'node-a' lists itself as a prerequisite. Since 'node-a' DOES exist
    // in the graph (it is the node itself), there is NO dangling-prerequisite
    // violation — the self-reference resolves. The only violation is the cycle
    // (the grey→grey self back-edge detected by DFS).
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it('rejects a direct cycle (A → B, B → A)', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'node-a',
          prerequisites: ['node-b'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'node-b',
          prerequisites: ['node-a'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it('cycle error message mentions "Cycle detected"', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'node-a',
          prerequisites: ['node-b'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'node-b',
          prerequisites: ['node-a'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
      ],
    };
    try {
      validateGraph(graph);
      fail('should have thrown');
    } catch (err) {
      const gve = err as GraphValidationError;
      const hasCycleViolation = gve.violations.some((v) => v.toLowerCase().includes('cycle'));
      expect(hasCycleViolation).toBe(true);
    }
  });

  it('rejects a longer cycle (A → B → C → A)', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'node-a',
          prerequisites: ['node-c'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'node-b',
          prerequisites: ['node-a'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'node-c',
          prerequisites: ['node-b'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });
});

// ---------------------------------------------------------------------------
// Dangling prerequisite references
// ---------------------------------------------------------------------------

describe('validateGraph() — dangling prerequisites', () => {
  it('rejects a node whose prerequisite ID does not exist', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'node-a',
          prerequisites: ['nonexistent-node'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it('dangling-prerequisite error mentions the missing node ID', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'node-a',
          prerequisites: ['ghost-node'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
      ],
    };
    try {
      validateGraph(graph);
      fail('should have thrown');
    } catch (err) {
      const gve = err as GraphValidationError;
      const hasDanglingViolation = gve.violations.some((v) => v.includes('ghost-node'));
      expect(hasDanglingViolation).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Duplicate node IDs
// ---------------------------------------------------------------------------

describe('validateGraph() — duplicate node IDs', () => {
  it('rejects two nodes with the same ID', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'node-a',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'node-a', // duplicate
          prerequisites: [],
          representationLevels: ['abstract'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'abstract', params: {} }],
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it('duplicate-ID error mentions "Duplicate node ID"', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'dup-node',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
        {
          id: 'dup-node',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
          },
        },
      ],
    };
    try {
      validateGraph(graph);
      fail('should have thrown');
    } catch (err) {
      const gve = err as GraphValidationError;
      const hasDupViolation = gve.violations.some((v) =>
        v.toLowerCase().includes('duplicate')
      );
      expect(hasDupViolation).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Band-ladder validation (per-node)
// ---------------------------------------------------------------------------

describe('validateGraph() — band-ladder validation', () => {
  it('rejects a node with an empty band ladder', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'no-bands-node',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [], // empty — invalid
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it('empty-band error mentions the node ID', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'empty-band-node',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: { bands: [] },
        },
      ],
    };
    try {
      validateGraph(graph);
      fail('should have thrown');
    } catch (err) {
      const gve = err as GraphValidationError;
      const mentionsNode = gve.violations.some((v) => v.includes('empty-band-node'));
      expect(mentionsNode).toBe(true);
    }
  });

  it('rejects a node whose bands are not ascending', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'bad-bands-node',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [
              { minCoordinate: 0, representationLevel: 'concrete', params: {} },
              { minCoordinate: 0.8, representationLevel: 'abstract', params: {} },
              { minCoordinate: 0.5, representationLevel: 'abstract', params: {} }, // not ascending
            ],
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it('rejects a node whose first band does not start at minCoordinate 0', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'bad-floor-node',
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [
              { minCoordinate: 0.5, representationLevel: 'concrete', params: {} }, // floor must be 0
            ],
          },
        },
      ],
    };
    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });
});

// ---------------------------------------------------------------------------
// Multiple violations collected before throwing
// ---------------------------------------------------------------------------

describe('validateGraph() — multiple violations collected', () => {
  it('collects both dangling-prereq and band violations before throwing', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      nodes: [
        {
          id: 'multi-error-node',
          prerequisites: ['nonexistent'],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [], // also invalid
          },
        },
      ],
    };
    try {
      validateGraph(graph);
      fail('should have thrown');
    } catch (err) {
      const gve = err as GraphValidationError;
      expect(gve.violations.length).toBeGreaterThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// GraphValidationError shape
// ---------------------------------------------------------------------------

describe('GraphValidationError', () => {
  it('name is "GraphValidationError"', () => {
    const err = new GraphValidationError(['some violation']);
    expect(err.name).toBe('GraphValidationError');
  });

  it('violations array is frozen', () => {
    const err = new GraphValidationError(['v1', 'v2']);
    expect(Object.isFrozen(err.violations)).toBe(true);
  });

  it('message includes all violation strings', () => {
    const err = new GraphValidationError(['violation one', 'violation two']);
    expect(err.message).toContain('violation one');
    expect(err.message).toContain('violation two');
  });

  it('is an instance of Error', () => {
    const err = new GraphValidationError(['x']);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GraphValidationError);
  });
});
