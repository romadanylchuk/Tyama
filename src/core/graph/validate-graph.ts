/**
 * validate-graph.ts — `validateGraph()` for DAG integrity + band-ladder checks.
 *
 * PURPOSE:
 *   Validates a `GraphDefinition` at startup/CI before any consumer code runs.
 *   A graph that passes `validateGraph()` is guaranteed to be:
 *     1. Structurally valid (no duplicate node IDs, no empty node list).
 *     2. Acyclic (DFS over `prerequisites` finds no back-edges → not a DAG → error).
 *     3. Self-consistent (every `prerequisites` ID resolves to an existing node).
 *     4. Band-ladder valid (each node's `difficultyHooks.bands` passes `validateBands`).
 *
 * WHAT IS NOT VALIDATED HERE (Phase 4):
 *   The dangling-generator assertion (`assertEveryGeneratorHasNode`) is NOT in
 *   this file. It would force importing the generator registry, which does not
 *   exist until Phase 5, coupling the graph layer to the generator layer.
 *   It is added in Phase 5 (either as an export here or in `registry.ts`).
 *
 * ERROR SEMANTICS:
 *   `validateGraph()` throws a `GraphValidationError` listing ALL violations
 *   found (not just the first) so that a misconfigured asset produces a single
 *   diagnostic with the full picture. This is a programmer/author error path —
 *   never a learner-facing event (anti-shame invariant: errors are routing
 *   signals, but graph validation errors are build/startup signals, not
 *   interaction signals).
 *
 * ALGORITHM (cycle detection):
 *   DFS from each node. Three colours: white (unvisited), grey (in current
 *   DFS path), black (fully processed). A grey-to-grey edge indicates a cycle.
 *   Violations are collected across all nodes before throwing.
 *
 * CHECK ORDERING (dangling-prereq vs cycle):
 *   The dangling-prerequisite check (check 3) and the cycle check (check 4) are
 *   INDEPENDENT and the order between them does not affect correctness:
 *     - `color` is seeded ONLY from real node IDs (`nodeMap.keys()`). A dangling
 *       prerequisite id therefore has NO colour entry, so `color.get(danglingId)`
 *       is `undefined` in `dfsVisit` — it matches neither 'grey' (cycle) nor
 *       'white' (recurse), so the DFS simply skips it without crashing.
 *     - A self-loop (A lists A as a prerequisite) is NOT a dangling reference —
 *       A exists in the graph — so it produces ONLY a cycle violation, never a
 *       dangling-prerequisite violation.
 *   Both checks read the shared `nodeMap`/`adjacency` built once up front; the
 *   later check never depends on mutations made by the earlier one.
 */

import type { GraphDefinition, GraphNode } from '@/core/types';
import { validateBands } from '@/core/difficulty/select-band';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown by `validateGraph()` when the graph asset contains one or more
 * structural violations. The message lists all violations found.
 *
 * This is a programmer/author error — never a learner-facing event.
 */
export class GraphValidationError extends Error {
  /** All violation messages found during validation. */
  readonly violations: readonly string[];

  constructor(violations: string[]) {
    super(
      'GraphValidationError: skill graph asset is invalid.\n' +
        violations.map((v, i) => `  [${i + 1}] ${v}`).join('\n')
    );
    this.name = 'GraphValidationError';
    this.violations = Object.freeze([...violations]);
  }
}

// ---------------------------------------------------------------------------
// DFS state
// ---------------------------------------------------------------------------

type NodeColor = 'white' | 'grey' | 'black';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * DFS visit for cycle detection.
 * Returns an array of violation strings for any cycle found from this node.
 * Mutates `color` in place.
 */
function dfsVisit(
  nodeId: string,
  adjacency: Map<string, string[]>,
  color: Map<string, NodeColor>,
  violations: string[]
): void {
  color.set(nodeId, 'grey');

  const prereqs = adjacency.get(nodeId) ?? [];
  for (const prereqId of prereqs) {
    const prereqColor = color.get(prereqId);
    if (prereqColor === 'grey') {
      // Back-edge found: a cycle exists.
      violations.push(
        `Cycle detected: node '${nodeId}' has a prerequisite path that leads back to itself ` +
          `via '${prereqId}'. The graph must be a DAG (directed acyclic graph).`
      );
    } else if (prereqColor === 'white') {
      dfsVisit(prereqId, adjacency, color, violations);
    }
    // 'black' = already fully processed, no cycle via this path.
  }

  color.set(nodeId, 'black');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * validateGraph(graph: GraphDefinition): void
 *
 * Validates the skill graph asset. Throws `GraphValidationError` if any
 * violations are found. On a valid graph returns `undefined` (no-op fast path).
 *
 * Checks performed (all violations collected before throwing):
 *   1. Non-empty node list.
 *   2. No duplicate node IDs.
 *   3. Every `prerequisites` ID references an existing node.
 *   4. No cycles (DFS over `prerequisites` edges).
 *   5. Each node's `difficultyHooks.bands` passes `validateBands`.
 *
 * @param graph - The `GraphDefinition` to validate.
 * @throws {GraphValidationError} If any violation is found.
 */
export function validateGraph(graph: GraphDefinition): void {
  const violations: string[] = [];

  // Check 1: non-empty node list.
  if (graph.nodes.length === 0) {
    violations.push('Graph has no nodes. A valid skill graph must have at least one node.');
    // No further checks are meaningful on an empty graph.
    throw new GraphValidationError(violations);
  }

  // Build node-id → node map for O(1) lookup.
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    // Check 2: no duplicate IDs.
    if (nodeMap.has(node.id)) {
      violations.push(`Duplicate node ID: '${node.id}'. Node IDs must be unique.`);
    } else {
      nodeMap.set(node.id, node);
    }
  }

  // Build adjacency map (nodeId → prerequisite node IDs) for DFS.
  // Also check 3: every prerequisite ID resolves to an existing node.
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    for (const prereqId of node.prerequisites) {
      if (!nodeMap.has(prereqId)) {
        violations.push(
          `Node '${node.id}' lists prerequisite '${prereqId}' which does not exist in the graph.`
        );
      }
    }
    adjacency.set(node.id, [...node.prerequisites]);
  }

  // Check 4: cycle detection via DFS.
  const color = new Map<string, NodeColor>();
  for (const nodeId of nodeMap.keys()) {
    color.set(nodeId, 'white');
  }
  for (const nodeId of nodeMap.keys()) {
    if (color.get(nodeId) === 'white') {
      dfsVisit(nodeId, adjacency, color, violations);
    }
  }

  // Check 5: per-node band-ladder validation.
  for (const node of graph.nodes) {
    const bandViolations = validateBands(node.difficultyHooks.bands);
    for (const v of bandViolations) {
      violations.push(`Node '${node.id}' band ladder error: ${v}`);
    }
  }

  if (violations.length > 0) {
    throw new GraphValidationError(violations);
  }
}
