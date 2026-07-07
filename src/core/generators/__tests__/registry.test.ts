/**
 * registry.test.ts — Unit tests for the GENERATORS registry.
 *
 * Tests:
 *   - getGenerator returns the generator for a known node, undefined for unknown.
 *   - hasGenerator returns true/false correctly.
 *   - resolveAvailability returns 'available'/'coming-soon' for the fixture graph.
 *   - resolveAvailability returns correct statuses for all 12 fixture nodes
 *     (all 'available' as of graphVersion 0.3.0 — every fixture node is
 *     generator-backed).
 *   - validateRegistry passes for the fixture graph.
 *   - assertEveryGeneratorHasNode throws for a dangling generator.
 *   - Anti-shame vocabulary: status values are only 'available' | 'coming-soon'.
 *   - GENERATORS is frozen (no runtime mutation).
 *   - GENERATORS has 12 entries: fruit-equations + number-bonds + multiplication +
 *     fraction-simplification + addition-within-20 + unknown-as-missing-addend +
 *     subtraction-within-20 + place-value + division + rounding + word-problems +
 *     decimal-comparison.
 */

import { loadGraph } from '../../graph/load-graph';
import {
  GENERATORS,
  getGenerator,
  hasGenerator,
  resolveAvailability,
  validateRegistry,
  assertEveryGeneratorHasNode,
  AssertEveryGeneratorHasNodeError,
} from '../registry';
import type { Generator } from '../../types';

// Suppress console.warn from loadGraph fixture guard.
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// getGenerator
// ---------------------------------------------------------------------------

describe('getGenerator()', () => {
  it('returns the generator for fruit-equations', () => {
    const gen = getGenerator('fruit-equations');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('fruit-equations');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for number-bonds', () => {
    const gen = getGenerator('number-bonds');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('number-bonds');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for multiplication', () => {
    const gen = getGenerator('multiplication');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('multiplication');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for fraction-simplification', () => {
    const gen = getGenerator('fraction-simplification');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('fraction-simplification');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for addition-within-20', () => {
    const gen = getGenerator('addition-within-20');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('addition-within-20');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for unknown-as-missing-addend', () => {
    const gen = getGenerator('unknown-as-missing-addend');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('unknown-as-missing-addend');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for subtraction-within-20', () => {
    const gen = getGenerator('subtraction-within-20');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('subtraction-within-20');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for place-value', () => {
    const gen = getGenerator('place-value');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('place-value');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for division', () => {
    const gen = getGenerator('division');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('division');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for rounding', () => {
    const gen = getGenerator('rounding');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('rounding');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for word-problems', () => {
    const gen = getGenerator('word-problems');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('word-problems');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns the generator for decimal-comparison', () => {
    const gen = getGenerator('decimal-comparison');
    expect(gen).toBeDefined();
    expect(gen!.skillNode).toBe('decimal-comparison');
    expect(typeof gen!.generate).toBe('function');
    expect(typeof gen!.instantiate).toBe('function');
  });

  it('returns undefined for an unknown node ID', () => {
    const gen = getGenerator('no-such-node' as string);
    expect(gen).toBeUndefined();
  });

  it('returns undefined without throwing for any unknown ID', () => {
    expect(() => getGenerator('totally-unknown' as string)).not.toThrow();
    expect(getGenerator('totally-unknown' as string)).toBeUndefined();
  });

  it('returns undefined for an empty string node ID', () => {
    expect(getGenerator('' as string)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hasGenerator
// ---------------------------------------------------------------------------

describe('hasGenerator()', () => {
  it('returns true for fruit-equations', () => {
    expect(hasGenerator('fruit-equations')).toBe(true);
  });

  it('returns true for number-bonds', () => {
    expect(hasGenerator('number-bonds')).toBe(true);
  });

  it('returns true for multiplication', () => {
    expect(hasGenerator('multiplication')).toBe(true);
  });

  it('returns true for fraction-simplification', () => {
    expect(hasGenerator('fraction-simplification')).toBe(true);
  });

  it('returns true for addition-within-20', () => {
    expect(hasGenerator('addition-within-20')).toBe(true);
  });

  it('returns true for unknown-as-missing-addend', () => {
    expect(hasGenerator('unknown-as-missing-addend')).toBe(true);
  });

  it('returns true for subtraction-within-20', () => {
    expect(hasGenerator('subtraction-within-20')).toBe(true);
  });

  it('returns true for place-value', () => {
    expect(hasGenerator('place-value')).toBe(true);
  });

  it('returns true for division', () => {
    expect(hasGenerator('division')).toBe(true);
  });

  it('returns true for rounding', () => {
    expect(hasGenerator('rounding')).toBe(true);
  });

  it('returns true for word-problems', () => {
    expect(hasGenerator('word-problems')).toBe(true);
  });

  it('returns true for decimal-comparison', () => {
    expect(hasGenerator('decimal-comparison')).toBe(true);
  });

  it('returns false for an arbitrary unknown node', () => {
    expect(hasGenerator('not-a-real-node' as string)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveAvailability
// ---------------------------------------------------------------------------

describe('resolveAvailability()', () => {
  it('returns one entry per graph node', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    expect(availability).toHaveLength(graph.nodes.length);
  });

  it('marks fruit-equations as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'fruit-equations');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks number-bonds as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'number-bonds');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks multiplication as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'multiplication');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks fraction-simplification as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'fraction-simplification');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks addition-within-20 as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'addition-within-20');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks unknown-as-missing-addend as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'unknown-as-missing-addend');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks subtraction-within-20 as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'subtraction-within-20');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks place-value as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'place-value');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks division as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'division');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks rounding as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'rounding');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks word-problems as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'word-problems');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('marks decimal-comparison as available', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const entry = availability.find((a) => a.nodeId === 'decimal-comparison');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('available');
  });

  it('never returns a shaming status word', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const FORBIDDEN = ['locked', 'disabled', 'error', 'unavailable', 'blocked', 'pending'];
    for (const entry of availability) {
      for (const forbidden of FORBIDDEN) {
        expect(entry.status).not.toContain(forbidden);
      }
    }
  });

  it('only returns statuses from the anti-shame vocabulary', () => {
    const graph = loadGraph();
    const availability = resolveAvailability(graph);
    const VALID_STATUSES = new Set(['available', 'coming-soon']);
    for (const entry of availability) {
      expect(VALID_STATUSES.has(entry.status)).toBe(true);
    }
  });

  it('does not throw for an empty graph', () => {
    const emptyGraph = { graphVersion: '0.0.0', nodes: [] };
    expect(() => resolveAvailability(emptyGraph)).not.toThrow();
    expect(resolveAvailability(emptyGraph)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateRegistry — fixture graph passes
// ---------------------------------------------------------------------------

describe('validateRegistry()', () => {
  it('passes for the fixture graph without throwing', () => {
    const graph = loadGraph();
    expect(() => validateRegistry(graph)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertEveryGeneratorHasNode — hard error on dangling generator
// ---------------------------------------------------------------------------

describe('assertEveryGeneratorHasNode()', () => {
  it('passes when all generators have matching graph nodes', () => {
    const graph = loadGraph();
    expect(() => assertEveryGeneratorHasNode(graph, GENERATORS)).not.toThrow();
  });

  it('throws AssertEveryGeneratorHasNodeError for a dangling generator', () => {
    const graph = loadGraph();
    // Create a generators map with a key that does not exist in the fixture graph.
    const danglingGenerators: Record<string, Generator> = {
      ...GENERATORS,
      'nonexistent-node': {
        skillNode: 'nonexistent-node',
        generate: () => { throw new Error('not called'); },
        instantiate: () => { throw new Error('not called'); },
      },
    };
    expect(() =>
      assertEveryGeneratorHasNode(graph, danglingGenerators as Readonly<Record<string, Generator>>)
    ).toThrow(AssertEveryGeneratorHasNodeError);
  });

  it('error message includes the dangling key', () => {
    const graph = loadGraph();
    const danglingGenerators: Record<string, Generator> = {
      'orphaned-key': {
        skillNode: 'orphaned-key',
        generate: () => { throw new Error('not called'); },
        instantiate: () => { throw new Error('not called'); },
      },
    };
    let caught: unknown;
    try {
      assertEveryGeneratorHasNode(graph, danglingGenerators as Readonly<Record<string, Generator>>);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AssertEveryGeneratorHasNodeError);
    const err = caught as AssertEveryGeneratorHasNodeError;
    expect(err.message).toContain('orphaned-key');
    expect(err.danglingKeys).toContain('orphaned-key');
  });

  it('AssertEveryGeneratorHasNodeError has a frozen danglingKeys array', () => {
    const graph = loadGraph();
    const danglingGenerators: Record<string, Generator> = {
      'ghost-node': {
        skillNode: 'ghost-node',
        generate: () => { throw new Error('not called'); },
        instantiate: () => { throw new Error('not called'); },
      },
    };
    let caught: unknown;
    try {
      assertEveryGeneratorHasNode(graph, danglingGenerators as Readonly<Record<string, Generator>>);
    } catch (e) {
      caught = e;
    }
    const err = caught as AssertEveryGeneratorHasNodeError;
    expect(Object.isFrozen(err.danglingKeys)).toBe(true);
  });

  it('lists ALL dangling keys (not just the first) in the error', () => {
    const graph = loadGraph();
    const danglingGenerators: Record<string, Generator> = {
      'missing-a': {
        skillNode: 'missing-a',
        generate: () => { throw new Error('not called'); },
        instantiate: () => { throw new Error('not called'); },
      },
      'missing-b': {
        skillNode: 'missing-b',
        generate: () => { throw new Error('not called'); },
        instantiate: () => { throw new Error('not called'); },
      },
    };
    let caught: unknown;
    try {
      assertEveryGeneratorHasNode(graph, danglingGenerators as Readonly<Record<string, Generator>>);
    } catch (e) {
      caught = e;
    }
    const err = caught as AssertEveryGeneratorHasNodeError;
    expect(err.danglingKeys).toHaveLength(2);
    expect(err.danglingKeys).toContain('missing-a');
    expect(err.danglingKeys).toContain('missing-b');
  });
});

// ---------------------------------------------------------------------------
// GENERATORS map properties
// ---------------------------------------------------------------------------

describe('GENERATORS map', () => {
  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(GENERATORS)).toBe(true);
  });

  it('contains exactly twelve entries (stage-05 + foundation + stage-07 generators)', () => {
    expect(Object.keys(GENERATORS)).toHaveLength(12);
    expect(Object.keys(GENERATORS)).toContain('fruit-equations');
    expect(Object.keys(GENERATORS)).toContain('number-bonds');
    expect(Object.keys(GENERATORS)).toContain('multiplication');
    expect(Object.keys(GENERATORS)).toContain('fraction-simplification');
    expect(Object.keys(GENERATORS)).toContain('addition-within-20');
    expect(Object.keys(GENERATORS)).toContain('unknown-as-missing-addend');
    expect(Object.keys(GENERATORS)).toContain('subtraction-within-20');
    expect(Object.keys(GENERATORS)).toContain('place-value');
    expect(Object.keys(GENERATORS)).toContain('division');
    expect(Object.keys(GENERATORS)).toContain('rounding');
    expect(Object.keys(GENERATORS)).toContain('word-problems');
    expect(Object.keys(GENERATORS)).toContain('decimal-comparison');
  });

  it('fruit-equations generator has the correct skillNode', () => {
    expect(GENERATORS['fruit-equations'].skillNode).toBe('fruit-equations');
  });

  it('number-bonds generator has the correct skillNode', () => {
    expect(GENERATORS['number-bonds'].skillNode).toBe('number-bonds');
  });

  it('multiplication generator has the correct skillNode', () => {
    expect(GENERATORS['multiplication'].skillNode).toBe('multiplication');
  });

  it('fraction-simplification generator has the correct skillNode', () => {
    expect(GENERATORS['fraction-simplification'].skillNode).toBe('fraction-simplification');
  });

  it('addition-within-20 generator has the correct skillNode', () => {
    expect(GENERATORS['addition-within-20'].skillNode).toBe('addition-within-20');
  });

  it('unknown-as-missing-addend generator has the correct skillNode', () => {
    expect(GENERATORS['unknown-as-missing-addend'].skillNode).toBe('unknown-as-missing-addend');
  });

  it('subtraction-within-20 generator has the correct skillNode', () => {
    expect(GENERATORS['subtraction-within-20'].skillNode).toBe('subtraction-within-20');
  });

  it('place-value generator has the correct skillNode', () => {
    expect(GENERATORS['place-value'].skillNode).toBe('place-value');
  });

  it('division generator has the correct skillNode', () => {
    expect(GENERATORS['division'].skillNode).toBe('division');
  });

  it('rounding generator has the correct skillNode', () => {
    expect(GENERATORS['rounding'].skillNode).toBe('rounding');
  });

  it('word-problems generator has the correct skillNode', () => {
    expect(GENERATORS['word-problems'].skillNode).toBe('word-problems');
  });

  it('decimal-comparison generator has the correct skillNode', () => {
    expect(GENERATORS['decimal-comparison'].skillNode).toBe('decimal-comparison');
  });
});
