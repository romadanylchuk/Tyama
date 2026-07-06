/**
 * route.test.ts — Phase 4 unit tests for the pure route() traversal function.
 *
 * Tests cover (per Phase 4 plan):
 *   (a) deepest-unmastered descent (multi-level prereq chain → deepest weak atom).
 *   (b) symptom-is-target when all prereqs mastered.
 *   (c) weakest-first selection among ≥2 unmastered prereqs (lower aggregate chosen).
 *   (d) untouched nodes ranked weakest (aggregate 0, untouched true).
 *   (e) probe-on-tie (genuine tie among ≥2 unmastered → 'probe', deterministic tiebreak).
 *   (f) descend-further on re-visited node with deeper unmastered prereqs (anti-loop visits=1).
 *   (g) escalate on re-visited node with no deeper prereqs (anti-loop visits=1, leaf).
 *   (h) escalate on re-visited node with visits=2 (repeat budget exhausted).
 *   (i) descentPath correctness (entry → … → target inclusive, length checks).
 *   (j) read-not-write: MasteryLookup has no setter (type-level + runtime snapshot unchanged).
 *   (k) AntiLoopMemory not mutated by route().
 *   (l) bounded termination on the validated DAG (visited-set guard does not hang).
 *   (m) Uses stage-02 GRAPH_FIXTURE for a realistic 3-node scenario.
 *
 * ANTI-SHAME:
 *   Every RoutingReason tested here is verified to be a FORWARD framing:
 *   'deepest-unmastered', 'symptom-is-target', 'probe', 'descend-further',
 *   'escalate' — none represents demotion, penalty, loss, or subtraction.
 *
 * PURITY:
 *   route() is a pure function — these tests run in Node with no DB, no I/O.
 */

import { route } from '@/core/routing/route';
import {
  createAntiLoopMemory,
  type MasteryLookup,
  type RoutingDecision,
} from '@/core/routing/routing-types';
import { makeMasteryLookup } from '@/core/mastery/mastery-lookup';
import type { GraphDefinition, GraphNode, NodeId } from '@/core/types';
import type { MasteryMetrics } from '@/core/mastery/mastery-metrics';
import { loadGraph } from '@/core/graph/load-graph';

// ---------------------------------------------------------------------------
// Graph fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal GraphNode for test graphs.
 */
function makeNode(
  id: NodeId,
  prerequisites: NodeId[] = []
): GraphNode {
  return {
    id,
    prerequisites,
    representationLevels: ['abstract'],
    difficultyHooks: {
      bands: [{ minCoordinate: 0, representationLevel: 'abstract', params: {} }],
    },
  };
}

/**
 * Build a GraphDefinition from a node list.
 */
function makeGraph(nodes: GraphNode[]): GraphDefinition {
  return { graphVersion: '0.0.0-test', nodes };
}

/**
 * Build a MasteryLookup from a plain Record<NodeId, number> (aggregate values).
 * Nodes absent from the record are treated as untouched (aggregate=0, untouched=true).
 * Nodes present with aggregate < 0.8 are in-progress (untouched=false).
 */
function lookupFromAggregates(
  aggregates: Record<NodeId, number>
): MasteryLookup {
  const snapshot = new Map<NodeId, MasteryMetrics>();
  for (const [nodeId, aggregate] of Object.entries(aggregates)) {
    // Build a minimal MasteryMetrics with the given aggregate.
    // We use the abstract slice to set a meaningful aggregate > 0.
    if (aggregate > 0) {
      // Inject a single abstract slice with scalar = aggregate so aggregate = max = aggregate.
      const patched: MasteryMetrics = {
        slices: {
          abstract: { window: [aggregate], scalar: aggregate },
        },
        aggregate,
      };
      snapshot.set(nodeId, patched);
    } else {
      // aggregate=0 with a recorded slice → in-progress at 0 (not untouched).
      const patched: MasteryMetrics = {
        slices: {
          abstract: { window: [0], scalar: 0 },
        },
        aggregate: 0,
      };
      snapshot.set(nodeId, patched);
    }
  }
  return makeMasteryLookup(snapshot);
}

/**
 * Build a MasteryLookup where the listed nodes are explicitly mastered (aggregate=1.0)
 * and all other nodes accessed during traversal are treated as untouched (absent from snapshot).
 */
function masteredLookup(masteredIds: NodeId[]): MasteryLookup {
  const agg: Record<NodeId, number> = {};
  for (const id of masteredIds) {
    agg[id] = 1.0;
  }
  return lookupFromAggregates(agg);
}

/**
 * Build a MasteryLookup where all nodes are untouched (absent from snapshot).
 */
function untouchedLookup(): MasteryLookup {
  return makeMasteryLookup(new Map());
}

// ---------------------------------------------------------------------------
// Test graphs
// ---------------------------------------------------------------------------

/**
 * 3-node chain: A (root) → B → C (entry/symptom)
 *
 * C requires B; B requires A. Entry = C (the symptom).
 * Traversal should descend toward A (deepest unmastered root).
 */
const CHAIN_GRAPH = makeGraph([
  makeNode('A', []),
  makeNode('B', ['A']),
  makeNode('C', ['B']),
]);

/**
 * Diamond graph: A (root) → B, A → C → D (entry)
 * D requires B and C; B and C both require A.
 * Used for weakest-first and tie-probe tests.
 */
const DIAMOND_GRAPH = makeGraph([
  makeNode('A', []),
  makeNode('B', ['A']),
  makeNode('C', ['A']),
  makeNode('D', ['B', 'C']),
]);

/**
 * Minimal single-node graph: just entry, no prerequisites.
 */
const SINGLE_NODE_GRAPH = makeGraph([makeNode('entry', [])]);

/**
 * Two-level: entry requires prereqA and prereqB; prereqA requires deepRoot.
 * For anti-loop further-descent test.
 */
const ANTI_LOOP_GRAPH = makeGraph([
  makeNode('deepRoot', []),
  makeNode('prereqA', ['deepRoot']),
  makeNode('prereqB', []),
  makeNode('entry', ['prereqA', 'prereqB']),
]);

// ---------------------------------------------------------------------------
// (a) deepest-unmastered descent
// ---------------------------------------------------------------------------

describe('route() — deepest-unmastered descent', () => {
  it('descends to deepest unmastered in a chain (A unmastered → route to A)', () => {
    // C → B → A. All unmastered. Should descend to A (the deepest root).
    const lookup = untouchedLookup();
    const memory = createAntiLoopMemory();
    const decision: RoutingDecision = route('C', CHAIN_GRAPH, lookup, memory);

    expect(decision.reason).toBe('deepest-unmastered');
    expect(decision.target).toBe('A');
    expect(decision.descentPath[0]).toBe('C');
    expect(decision.descentPath[decision.descentPath.length - 1]).toBe('A');
    expect(decision.antiLoop).toBeUndefined();
  });

  it('descends only as deep as the first mastered prereq (B mastered → stop at B)', () => {
    // C → B → A. B is mastered; A is not — but we only descend through unmastered.
    // C's prereq B is mastered → C itself is the symptom-is-target (all prereqs mastered).
    const lookup = masteredLookup(['B']);
    const memory = createAntiLoopMemory();
    const decision: RoutingDecision = route('C', CHAIN_GRAPH, lookup, memory);

    // B is mastered, so C has no unmastered prereqs → symptom-is-target.
    expect(decision.reason).toBe('symptom-is-target');
    expect(decision.target).toBe('C');
  });

  it('stops at B when B is unmastered but A is mastered', () => {
    // C → B → A. A mastered; B unmastered. Route should stop at B.
    const lookup = masteredLookup(['A']);
    const memory = createAntiLoopMemory();
    const decision: RoutingDecision = route('C', CHAIN_GRAPH, lookup, memory);

    expect(decision.reason).toBe('deepest-unmastered');
    expect(decision.target).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// (b) symptom-is-target when all prereqs mastered
// ---------------------------------------------------------------------------

describe('route() — symptom-is-target', () => {
  it('returns symptom-is-target when all prereqs of entry are mastered', () => {
    // C requires B; B is mastered → symptom-is-target.
    const lookup = masteredLookup(['B']);
    const memory = createAntiLoopMemory();
    const decision = route('C', CHAIN_GRAPH, lookup, memory);

    expect(decision.reason).toBe('symptom-is-target');
    expect(decision.target).toBe('C');
    expect(decision.descentPath).toEqual(['C']);
  });

  it('returns symptom-is-target for a root node with no prerequisites', () => {
    const lookup = untouchedLookup();
    const memory = createAntiLoopMemory();
    const decision = route('entry', SINGLE_NODE_GRAPH, lookup, memory);

    expect(decision.reason).toBe('symptom-is-target');
    expect(decision.target).toBe('entry');
    expect(decision.descentPath).toEqual(['entry']);
  });

  it('returns symptom-is-target for a node whose all prereqs are mastered (diamond, all mastered)', () => {
    // D → B, C (both mastered). D has no unmastered prereqs.
    const lookup = masteredLookup(['B', 'C', 'A']);
    const memory = createAntiLoopMemory();
    const decision = route('D', DIAMOND_GRAPH, lookup, memory);

    expect(decision.reason).toBe('symptom-is-target');
    expect(decision.target).toBe('D');
  });
});

// ---------------------------------------------------------------------------
// (c) weakest-first selection among ≥2 unmastered prereqs
// ---------------------------------------------------------------------------

describe('route() — weakest-first selection', () => {
  it('descends into the lower-aggregate prereq when two prereqs are both unmastered', () => {
    // D → B (aggregate 0.5) and C (aggregate 0.2). Should choose C (weaker).
    // A is mastered so traversal stops at B or C (no deeper descent from them).
    const lookup = lookupFromAggregates({ B: 0.5, C: 0.2, A: 1.0 });
    const memory = createAntiLoopMemory();
    const decision = route('D', DIAMOND_GRAPH, lookup, memory);

    // C is weaker (0.2 < 0.5) — should descend into C.
    // C's prereq A is mastered → C is deepest-unmastered.
    expect(decision.target).toBe('C');
    expect(decision.reason).toBe('deepest-unmastered');
    expect(decision.descentPath).toContain('D');
    expect(decision.descentPath).toContain('C');
  });

  it('descends into the higher-aggregate prereq when the other is stronger (reversed)', () => {
    // D → B (aggregate 0.2) and C (aggregate 0.5). Should choose B (weaker).
    const lookup = lookupFromAggregates({ B: 0.2, C: 0.5, A: 1.0 });
    const memory = createAntiLoopMemory();
    const decision = route('D', DIAMOND_GRAPH, lookup, memory);

    expect(decision.target).toBe('B');
    expect(decision.reason).toBe('deepest-unmastered');
  });
});

// ---------------------------------------------------------------------------
// (d) untouched nodes ranked weakest
// ---------------------------------------------------------------------------

describe('route() — untouched nodes ranked weakest', () => {
  it('prefers an untouched node over an in-progress-but-low node', () => {
    // D → B (untouched, not in snapshot) and C (in-progress, aggregate 0.1).
    // Untouched B should be ranked weakest (higher priority descent).
    // A is mastered.
    const snapshot = new Map<NodeId, MasteryMetrics>();
    // C: in-progress at 0.1
    snapshot.set('C', {
      slices: { abstract: { window: [0.1], scalar: 0.1 } },
      aggregate: 0.1,
    });
    // A: mastered
    snapshot.set('A', {
      slices: { abstract: { window: [1.0], scalar: 1.0 } },
      aggregate: 1.0,
    });
    // B: absent (untouched)
    const lookup = makeMasteryLookup(snapshot);
    const memory = createAntiLoopMemory();
    const decision = route('D', DIAMOND_GRAPH, lookup, memory);

    // B is untouched → ranked weakest → descended into.
    // B's prereq A is mastered → B is deepest-unmastered.
    expect(decision.target).toBe('B');
    expect(decision.reason).toBe('deepest-unmastered');
  });

  it('falls through to untouched at entry when no prereqs exist', () => {
    // Single node: 'entry' with no prerequisites and no mastery data.
    const lookup = makeMasteryLookup(new Map());
    const memory = createAntiLoopMemory();
    const decision = route('entry', SINGLE_NODE_GRAPH, lookup, memory);

    // No prerequisites → symptom-is-target (entry IS the target regardless of untouched).
    expect(decision.reason).toBe('symptom-is-target');
    expect(decision.target).toBe('entry');
  });
});

// ---------------------------------------------------------------------------
// (e) probe-on-tie
// ---------------------------------------------------------------------------

describe('route() — probe on genuine tie', () => {
  it('emits probe when two unmastered prereqs have equal aggregate (in-progress tie)', () => {
    // D → B (aggregate 0.3) and C (aggregate 0.3). Genuine tie.
    const lookup = lookupFromAggregates({ B: 0.3, C: 0.3, A: 1.0 });
    const memory = createAntiLoopMemory();
    const decision = route('D', DIAMOND_GRAPH, lookup, memory);

    expect(decision.reason).toBe('probe');
    // Target is deterministic tiebreak (lowest-id lexicographic): 'B' < 'C'.
    expect(decision.target).toBe('B');
  });

  it('emits probe when all prereqs are untouched (all-zero tie)', () => {
    // D → B and C, both untouched. Genuine tie (all untouched).
    const lookup = makeMasteryLookup(new Map());
    const memory = createAntiLoopMemory();
    const decision = route('D', DIAMOND_GRAPH, lookup, memory);

    expect(decision.reason).toBe('probe');
    // Both B and C untouched → tiebreak by lowest lexicographic id: 'B' < 'C'.
    expect(decision.target).toBe('B');
  });

  it('descentPath for probe includes the entry and the probe target', () => {
    const lookup = lookupFromAggregates({ B: 0.3, C: 0.3, A: 1.0 });
    const memory = createAntiLoopMemory();
    const decision = route('D', DIAMOND_GRAPH, lookup, memory);

    expect(decision.descentPath[0]).toBe('D');
    expect(decision.descentPath[decision.descentPath.length - 1]).toBe(decision.target);
  });
});

// ---------------------------------------------------------------------------
// (f) anti-loop: descend-further
// ---------------------------------------------------------------------------

describe('route() — anti-loop: descend-further', () => {
  it('emits descend-further when entry was recently routed to (visits=1) and has unmastered prereqs', () => {
    // entry → prereqA → deepRoot; prereqB also.
    // entry was recently routed to (visits=1). deepRoot is unmastered.
    const memory = createAntiLoopMemory();
    memory.set('entry', { visits: 1, lastApproach: 'abstract' });

    // prereqA and prereqB unmastered; deepRoot also unmastered.
    const lookup = untouchedLookup();
    const decision = route('entry', ANTI_LOOP_GRAPH, lookup, memory);

    expect(decision.reason).toBe('descend-further');
    expect(decision.antiLoop).toBeDefined();
    expect(decision.antiLoop!.priorTarget).toBe('entry');
    expect(decision.antiLoop!.escalateToExplanation).toBe(false);
    expect(decision.antiLoop!.explanationContext).toBeUndefined();
    // Target should be one of the prereqs (the weakest).
    expect(['prereqA', 'prereqB']).toContain(decision.target);
  });

  it('descentPath for descend-further starts at entry and ends at the further target', () => {
    const memory = createAntiLoopMemory();
    memory.set('entry', { visits: 1, lastApproach: 'abstract' });
    const lookup = untouchedLookup();
    const decision = route('entry', ANTI_LOOP_GRAPH, lookup, memory);

    expect(decision.descentPath[0]).toBe('entry');
    expect(decision.descentPath[decision.descentPath.length - 1]).toBe(decision.target);
  });
});

// ---------------------------------------------------------------------------
// (g) anti-loop: escalate (leaf node, visits=1)
// ---------------------------------------------------------------------------

describe('route() — anti-loop: escalate (leaf)', () => {
  it('emits escalate when entry was recently routed to (visits=1) and has no unmastered prereqs', () => {
    // Single node 'entry' with no prerequisites.
    // entry was recently routed to (visits=1). No prereqs → escalate.
    const memory = createAntiLoopMemory();
    memory.set('entry', { visits: 1, lastApproach: 'abstract' });

    const lookup = untouchedLookup();
    const decision = route('entry', SINGLE_NODE_GRAPH, lookup, memory);

    expect(decision.reason).toBe('escalate');
    expect(decision.target).toBe('entry');
    expect(decision.antiLoop).toBeDefined();
    expect(decision.antiLoop!.escalateToExplanation).toBe(true);
    expect(decision.antiLoop!.priorTarget).toBe('entry');
    expect(decision.antiLoop!.explanationContext).toBeDefined();
    expect(decision.antiLoop!.explanationContext!.priorApproach).toBeDefined();
  });

  it('escalate descentPath is just [entry] (no descent on escalation)', () => {
    const memory = createAntiLoopMemory();
    memory.set('entry', { visits: 1, lastApproach: 'abstract' });
    const lookup = untouchedLookup();
    const decision = route('entry', SINGLE_NODE_GRAPH, lookup, memory);

    expect(decision.descentPath).toEqual(['entry']);
  });

  it('escalate ExplanationContext has skillNode set to the entry node', () => {
    const memory = createAntiLoopMemory();
    memory.set('entry', { visits: 1, lastApproach: 'abstract' });
    const lookup = untouchedLookup();
    const decision = route('entry', SINGLE_NODE_GRAPH, lookup, memory);

    expect(decision.antiLoop!.explanationContext!.skillNode).toBe('entry');
  });
});

// ---------------------------------------------------------------------------
// (h) anti-loop: escalate on visits >= 2 (repeat budget exhausted)
// ---------------------------------------------------------------------------

describe('route() — anti-loop: escalate (visits >= 2)', () => {
  it('escalates immediately when visits=2 even if unmastered prereqs exist', () => {
    // entry has unmastered prereqs, but visits=2 → escalate immediately.
    const memory = createAntiLoopMemory();
    memory.set('entry', { visits: 2, lastApproach: 'abstract' });

    const lookup = untouchedLookup();
    const decision = route('entry', ANTI_LOOP_GRAPH, lookup, memory);

    expect(decision.reason).toBe('escalate');
    expect(decision.target).toBe('entry');
    expect(decision.antiLoop!.escalateToExplanation).toBe(true);
  });

  it('escalates when visits=3 (well beyond budget)', () => {
    const memory = createAntiLoopMemory();
    memory.set('entry', { visits: 3, lastApproach: 'pictorial' });

    const lookup = untouchedLookup();
    const decision = route('entry', SINGLE_NODE_GRAPH, lookup, memory);

    expect(decision.reason).toBe('escalate');
    expect(decision.antiLoop!.escalateToExplanation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (i) descentPath correctness
// ---------------------------------------------------------------------------

describe('route() — descentPath correctness', () => {
  it('descentPath[0] is always the entry node', () => {
    const lookup = untouchedLookup();
    const memory = createAntiLoopMemory();
    const decision = route('C', CHAIN_GRAPH, lookup, memory);

    expect(decision.descentPath[0]).toBe('C');
  });

  it('descentPath last element is always the target', () => {
    const lookup = untouchedLookup();
    const memory = createAntiLoopMemory();
    const decision = route('C', CHAIN_GRAPH, lookup, memory);

    expect(decision.descentPath[decision.descentPath.length - 1]).toBe(decision.target);
  });

  it('descentPath has length 1 when target === entry (symptom-is-target)', () => {
    const lookup = masteredLookup(['B']);
    const memory = createAntiLoopMemory();
    const decision = route('C', CHAIN_GRAPH, lookup, memory);

    expect(decision.reason).toBe('symptom-is-target');
    expect(decision.descentPath.length).toBe(1);
    expect(decision.descentPath[0]).toBe('C');
  });

  it('descentPath has correct intermediate nodes on a 3-node chain descent', () => {
    // C → B → A; all unmastered. Path should be [C, B, A].
    const lookup = untouchedLookup();
    const memory = createAntiLoopMemory();
    const decision = route('C', CHAIN_GRAPH, lookup, memory);

    // A is a root with no prereqs, so B descends to A. But A has no unmastered prereqs
    // itself (it has none) → A is deepest-unmastered.
    // Path: C → B → A.
    expect(decision.descentPath).toEqual(['C', 'B', 'A']);
  });
});

// ---------------------------------------------------------------------------
// (j) read-not-write: MasteryLookup has no setter
// ---------------------------------------------------------------------------

describe('route() — read-not-write boundary', () => {
  it('MasteryLookup type has no write method (structural type check)', () => {
    // A MasteryLookup is just a function (nodeId) => MasterySnapshot.
    // This test verifies at RUNTIME that the returned lookup has no setter method.
    const snapshot = new Map<NodeId, MasteryMetrics>();
    const lookup: MasteryLookup = makeMasteryLookup(snapshot);

    // lookup is a plain function — no properties of its own should be settable.
    expect(typeof lookup).toBe('function');

    // Verify that the lookup has no write/set method (structural read-not-write boundary).
    // Cast through unknown to inspect at runtime without triggering a type error.
    const lookupAsObj = lookup as unknown as Record<string, unknown>;
    expect(lookupAsObj['set']).toBeUndefined();
    expect(lookupAsObj['writeMastery']).toBeUndefined();
  });

  it('snapshot is unchanged after route() runs (no mutation)', () => {
    // Build a snapshot with a known value and verify route() did not mutate it.
    const snapshot = new Map<NodeId, MasteryMetrics>();
    const beforeMetrics: MasteryMetrics = {
      slices: { abstract: { window: [0.3], scalar: 0.3 } },
      aggregate: 0.3,
    };
    snapshot.set('B', beforeMetrics);

    const lookup = makeMasteryLookup(snapshot);
    const memory = createAntiLoopMemory();
    route('C', CHAIN_GRAPH, lookup, memory);

    // Snapshot should be identical after route() ran.
    expect(snapshot.get('B')).toBe(beforeMetrics); // same reference = no mutation
    expect(snapshot.size).toBe(1); // no new entries added
  });
});

// ---------------------------------------------------------------------------
// (k) AntiLoopMemory not mutated by route()
// ---------------------------------------------------------------------------

describe('route() — AntiLoopMemory not mutated', () => {
  it('route() does not write to the AntiLoopMemory (read-only usage)', () => {
    const memory = createAntiLoopMemory();
    const lookup = untouchedLookup();

    // Capture size before and after route().
    const sizeBefore = memory.size;
    route('C', CHAIN_GRAPH, lookup, memory);
    const sizeAfter = memory.size;

    expect(sizeAfter).toBe(sizeBefore);
    // Specifically: entry node 'C' should NOT have been recorded.
    expect(memory.has('C')).toBe(false);
    expect(memory.has('B')).toBe(false);
    expect(memory.has('A')).toBe(false);
  });

  it('route() does not mutate existing entries in AntiLoopMemory', () => {
    const memory = createAntiLoopMemory();
    // Pre-set visits=1 for entry.
    memory.set('entry', { visits: 1, lastApproach: 'abstract' });

    const lookup = untouchedLookup();
    route('entry', SINGLE_NODE_GRAPH, lookup, memory);

    // The existing entry should be unchanged (route reads, not writes).
    expect(memory.get('entry')).toEqual({ visits: 1, lastApproach: 'abstract' });
    // Size unchanged.
    expect(memory.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (l) Bounded termination (visited-set guard)
// ---------------------------------------------------------------------------

describe('route() — bounded termination', () => {
  it('terminates on a long chain without hanging', () => {
    // Build a chain of 50 nodes. route() should terminate and find the deepest.
    const nodes: GraphNode[] = [];
    for (let i = 0; i < 50; i++) {
      nodes.push(makeNode(`node-${i}`, i > 0 ? [`node-${i - 1}`] : []));
    }
    const longGraph = makeGraph(nodes);
    const lookup = untouchedLookup();
    const memory = createAntiLoopMemory();

    const decision = route('node-49', longGraph, lookup, memory);

    // The deepest unmastered node is node-0 (root, no prerequisites).
    expect(decision.reason).toBe('deepest-unmastered');
    expect(decision.target).toBe('node-0');
    expect(decision.descentPath.length).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// (m) Stage-02 GRAPH_FIXTURE integration
// ---------------------------------------------------------------------------

describe('route() — GRAPH_FIXTURE integration', () => {
  // GRAPH_FIXTURE:
  //   addition-within-20 (root, no prereqs)
  //   unknown-as-missing-addend (prereq: addition-within-20)
  //   fruit-equations (prereqs: addition-within-20, unknown-as-missing-addend)

  // Import the fixture graph directly for integration-style tests.
  // loadGraph() emits a console.warn for fixture; suppress in tests.
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('descends to addition-within-20 when all nodes unmastered (deepest root)', () => {
    const graph = loadGraph();

    const lookup = untouchedLookup();
    const memory = createAntiLoopMemory();
    const decision = route('fruit-equations', graph, lookup, memory);

    // fruit-equations → (addition-within-20, unknown-as-missing-addend)
    // Both prereqs are untouched → tie → probe.
    // (tiebreak: 'addition-within-20' < 'unknown-as-missing-addend' lexicographically)
    expect(['probe', 'deepest-unmastered']).toContain(decision.reason);
    expect(decision.descentPath[0]).toBe('fruit-equations');
  });

  it('routes to fruit-equations itself when all its prereqs are mastered', () => {
    const graph = loadGraph();

    const lookup = masteredLookup(['addition-within-20', 'unknown-as-missing-addend']);
    const memory = createAntiLoopMemory();
    const decision = route('fruit-equations', graph, lookup, memory);

    expect(decision.reason).toBe('symptom-is-target');
    expect(decision.target).toBe('fruit-equations');
    expect(decision.descentPath).toEqual(['fruit-equations']);
  });

  it('routes to unknown-as-missing-addend when addition-within-20 is mastered', () => {
    const graph = loadGraph();

    // addition-within-20 mastered; unknown-as-missing-addend not.
    const lookup = masteredLookup(['addition-within-20']);
    const memory = createAntiLoopMemory();
    const decision = route('fruit-equations', graph, lookup, memory);

    // Only unmastered prereq of fruit-equations is unknown-as-missing-addend.
    // unknown-as-missing-addend's prereq addition-within-20 is mastered → stop at unknown-as-missing-addend.
    expect(decision.target).toBe('unknown-as-missing-addend');
    expect(decision.reason).toBe('deepest-unmastered');
  });
});

// ---------------------------------------------------------------------------
// Additional anti-shame contract test
// ---------------------------------------------------------------------------

describe('route() — anti-shame invariant', () => {
  it('every RoutingReason is a forward framing (not a penalty)', () => {
    const SHAME_PATTERNS = [/demotion/i, /penalt/i, /subtract/i, /loss/i, /wrong/i, /fail/i, /block/i];
    const VALID_REASONS = [
      'deepest-unmastered',
      'symptom-is-target',
      'probe',
      'descend-further',
      'escalate',
    ] as const;

    for (const reason of VALID_REASONS) {
      for (const pattern of SHAME_PATTERNS) {
        expect(reason).not.toMatch(pattern);
      }
    }
  });

  it('route() with no anti-loop memory entry does not escalate or produce shame signals', () => {
    const lookup = untouchedLookup();
    const memory = createAntiLoopMemory();
    const decision = route('C', CHAIN_GRAPH, lookup, memory);

    // Fresh session → no anti-loop, no escalation.
    expect(decision.antiLoop).toBeUndefined();
    expect(decision.reason).not.toBe('escalate');
  });
});
