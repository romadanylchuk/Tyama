/**
 * node-layout.ts — Pure deterministic node-map layout (Stage 06, Phase 6).
 *
 * PURE, DETERMINISTIC:
 *   layoutNodes(graph) is a pure function — no DB, no clock, no I/O, no
 *   randomness. Same graph → same layout, every call. Rows are derived from
 *   prerequisite DEPTH (a root node with no prerequisites is row 0; a node's
 *   row is 1 + the max row of its prerequisites), NOT from any authored
 *   "where to next" ordering (that is a separate, distinct seam — see
 *   @/navigation/where-to-next.ts). The graph says what is POSSIBLE and in
 *   what order it becomes possible; this module visualizes exactly that.
 *
 * COLUMN ASSIGNMENT:
 *   Within a row, nodes are assigned columns in the same order they appear in
 *   `graph.nodes` (stable, deterministic — never re-sorted by any runtime
 *   value like mastery or availability).
 *
 * RESERVED COMPANION SLOT (placement constraint, no relayout needed):
 *   The deferred cosmetic-companion (out of MVP scope) needs a stable
 *   on-screen anchor to bind to later. `companionSlot.row` is fixed at
 *   `maxRow + 1` — one row BELOW the deepest node row, so introducing the
 *   companion component never requires recomputing or shifting any node's
 *   `{ row, col }`. `anchor: 'below-map'` documents this placement choice for
 *   whoever wires the companion in a future stage.
 *
 * CYCLE DEFENSE:
 *   The graph is validated as an acyclic DAG at startup (`validateGraph`).
 *   `computeDepth` still guards against a cycle defensively (returns depth 0
 *   for a node encountered while already being computed) so this module can
 *   never infinite-loop even if that invariant were ever violated upstream.
 */

import type { GraphDefinition, NodeId } from '@/core/types';

// ---------------------------------------------------------------------------
// NodeLayoutEntry / CompanionSlot / NodeMapLayout — the pure output shape
// ---------------------------------------------------------------------------

export interface NodeLayoutEntry {
  readonly nodeId: NodeId;
  /** Prerequisite-depth row (0 = a root node with no prerequisites). */
  readonly row: number;
  /** Stable column within the row, assigned in `graph.nodes` order. */
  readonly col: number;
}

/**
 * A reserved on-screen anchor for the deferred cosmetic-companion (stage 07+).
 * Documents the placement constraint; no companion is rendered here.
 */
export interface CompanionSlot {
  readonly anchor: 'below-map';
  /** One row below the deepest node row — never shifts as nodes are added. */
  readonly row: number;
}

export interface NodeMapLayout {
  readonly entries: readonly NodeLayoutEntry[];
  readonly companionSlot: CompanionSlot;
}

// ---------------------------------------------------------------------------
// layoutNodes — the pure layout function
// ---------------------------------------------------------------------------

/**
 * layoutNodes(graph): NodeMapLayout
 *
 * Deterministic prerequisite-depth-row layout over `loadGraph()`'s nodes,
 * plus a reserved companion-slot region.
 *
 * @param graph - The active skill graph (from `loadGraph()`).
 * @returns     - `{ entries, companionSlot }`.
 */
export function layoutNodes(graph: GraphDefinition): NodeMapLayout {
  const nodeIndex = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const depthCache = new Map<NodeId, number>();
  const inProgress = new Set<NodeId>();

  function computeDepth(nodeId: NodeId): number {
    const cached = depthCache.get(nodeId);
    if (cached !== undefined) return cached;

    const node = nodeIndex.get(nodeId);
    if (node === undefined || node.prerequisites.length === 0) {
      depthCache.set(nodeId, 0);
      return 0;
    }

    if (inProgress.has(nodeId)) {
      // Defensive cycle guard — the graph is validated as an acyclic DAG at
      // startup (validateGraph). This should never trigger; if it somehow
      // did, depth 0 is a safe, non-crashing degradation.
      return 0;
    }
    inProgress.add(nodeId);
    const depth = 1 + Math.max(...node.prerequisites.map((p) => computeDepth(p)));
    inProgress.delete(nodeId);

    depthCache.set(nodeId, depth);
    return depth;
  }

  const colCounters = new Map<number, number>();
  const entries: NodeLayoutEntry[] = graph.nodes.map((node) => {
    const row = computeDepth(node.id);
    const col = colCounters.get(row) ?? 0;
    colCounters.set(row, col + 1);
    return { nodeId: node.id, row, col };
  });

  const maxRow = entries.reduce((max, e) => Math.max(max, e.row), 0);

  const companionSlot: CompanionSlot = {
    anchor: 'below-map',
    row: maxRow + 1,
  };

  return { entries, companionSlot };
}
