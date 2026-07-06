/**
 * curated-path.ts — Config-as-data curated entry path (Stage 06, Phase 5).
 *
 * "THE GRAPH SAYS WHAT IS POSSIBLE; THE CURATED PATH SAYS WHAT IS WORTHWHILE"
 *   `CURATED_ENTRY_PATH` is new data OWNED BY this stage — an ordered
 *   progression sequence that RESPECTS the graph (never proposes a
 *   `not-yet-open` node; internally consistent with the DAG's prerequisite
 *   edges among its own members) but is NOT DERIVED from the graph.
 *
 * CONFIG-AS-DATA, SHIPPED-DEFAULTS-NOW:
 *   This is the mechanism + a working default sequence. `pedagogy-pass`
 *   calibrates the exact sequence later as a pure data change — no code
 *   change required. Never hardcode a curated sequence into a call site;
 *   always import `CURATED_ENTRY_PATH` (or an injected override) from here.
 *
 * WHY ONLY GENERATOR-BACKED NODES ARE LISTED:
 *   `addition-within-20` and `unknown-as-missing-addend` (the fixture's two
 *   generator-less root nodes) are `'coming-soon'` per
 *   `resolveAvailability()` — no generator is registered for them yet. A
 *   curated path entry that resolves to `'coming-soon'` is a shipped-time
 *   defect (the whole point of `validateCuratedPath` is to catch this before
 *   ship), so the default sequence lists only the four generator-backed
 *   nodes, ordered so that any prerequisite relationship BETWEEN two
 *   in-path nodes is respected (`multiplication` after `number-bonds`;
 *   `fraction-simplification` after `fruit-equations`).
 */

import type { NodeId, GraphDefinition } from '@/core/types';
import { resolveAvailability } from '@/core/generators/registry';

// ---------------------------------------------------------------------------
// CURATED_ENTRY_PATH — the shipped default sequence
// ---------------------------------------------------------------------------

/**
 * The shipped default curated entry path (config-as-data).
 *
 * Ordered so every in-path prerequisite relationship is respected:
 *   - `number-bonds`             — prerequisite: `addition-within-20` (not in path; root, coming-soon).
 *   - `fruit-equations`          — prerequisites: `addition-within-20`, `unknown-as-missing-addend` (neither in path).
 *   - `multiplication`           — prerequisite: `number-bonds` (appears earlier above).
 *   - `fraction-simplification`  — prerequisite: `fruit-equations` (appears earlier above).
 *
 * `pedagogy-pass` recalibrates this sequence later as a pure data change.
 */
export const CURATED_ENTRY_PATH: readonly NodeId[] = Object.freeze([
  'number-bonds',
  'fruit-equations',
  'multiplication',
  'fraction-simplification',
]);

// ---------------------------------------------------------------------------
// validateCuratedPath — startup/CI guard
// ---------------------------------------------------------------------------

/**
 * validateCuratedPath(graph, path): string[]
 *
 * Asserts the curated path never references a node absent from the graph and
 * never proposes an unreachable (`'coming-soon'` / not-yet-open) node at ship
 * time, given the currently-registered generator set. As a bonus consistency
 * check, also flags a path node placed BEFORE one of its own prerequisites
 * when that prerequisite is also a member of the same path (never re-orders
 * — only reports violations).
 *
 * Intended to run at startup (e.g. `AppShell`/`App.tsx` init) and in a
 * jest/CI test. Never throws — returns a (possibly empty) violation list so
 * the caller decides how to surface it.
 *
 * @param graph - The loaded `GraphDefinition` (from `loadGraph()`).
 * @param path  - The curated path to validate. Defaults to `CURATED_ENTRY_PATH`.
 * @returns     - Human-readable violation strings. Empty array = valid.
 */
export function validateCuratedPath(
  graph: GraphDefinition,
  path: readonly NodeId[] = CURATED_ENTRY_PATH
): string[] {
  const violations: string[] = [];

  const nodeIndex = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const availability = new Map(
    resolveAvailability(graph).map((a) => [a.nodeId, a.status] as const)
  );

  // Tracks the position at which each path node was already confirmed present,
  // so a later node's in-path prerequisite ordering can be checked.
  const positionOf = new Map<NodeId, number>();

  path.forEach((nodeId, index) => {
    const node = nodeIndex.get(nodeId);

    if (node === undefined) {
      violations.push(
        `Curated path references node '${nodeId}' which is absent from the graph.`
      );
      return; // No further checks possible for a node the graph doesn't have.
    }

    if (availability.get(nodeId) === 'coming-soon') {
      violations.push(
        `Curated path proposes an unreachable/not-yet-open node: '${nodeId}' has no ` +
          'registered generator.'
      );
    }

    for (const prereqId of node.prerequisites) {
      if (positionOf.has(prereqId)) {
        // Prerequisite is in the path AND already seen at an earlier index —
        // fine. Only a violation if the prerequisite is in the path but NOT
        // yet seen (i.e. it appears later, or this is a duplicate visit).
        continue;
      }
      // The prerequisite might still appear LATER in the path — check the
      // full path for its position.
      const laterIndex = path.indexOf(prereqId);
      if (laterIndex !== -1 && laterIndex > index) {
        violations.push(
          `Curated path places '${nodeId}' (index ${index}) before its own prerequisite ` +
            `'${prereqId}' (index ${laterIndex}).`
        );
      }
    }

    positionOf.set(nodeId, index);
  });

  return violations;
}
