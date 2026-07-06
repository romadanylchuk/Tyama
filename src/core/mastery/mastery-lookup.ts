/**
 * mastery-lookup.ts — Read-only MasteryLookup builder for the session layer.
 *
 * `makeMasteryLookup` constructs the `MasteryLookup` function passed to
 * `route()` (phase 4). The session layer builds a snapshot of `MasteryMetrics`
 * per node from `getProgress` + `parseMasteryMetrics` OUTSIDE of `route()`,
 * then passes the resulting plain reader function in.
 *
 * READ-NOT-WRITE BOUNDARY:
 *   The returned `MasteryLookup` is a plain function — it exposes NO write
 *   method. `route()` receives only this type, so it structurally CANNOT mutate
 *   mastery state. The no-write boundary is enforced by the type, not by
 *   convention.
 *
 * UNTOUCHED NODE DETECTION:
 *   A node is `untouched` when no slice has any attempt recorded for any
 *   representation level (i.e. every slice window is empty / no slices present).
 *   We test window CONTENTS, not slice-key presence, so a re-parsed empty-window
 *   slice still counts as untouched. The routing algorithm treats untouched nodes
 *   as the weakest candidate — more aggressively descended into than a node with
 *   in-progress (but low) data.
 *
 * SESSION LAYER PATTERN:
 *   ```
 *   // 1. Build snapshot: for each node of interest, call getProgress + parseMasteryMetrics
 *   const snapshot = new Map<NodeId, MasteryMetrics>();
 *   for (const nodeId of relevantNodeIds) {
 *     const row = await getProgress(nodeId);
 *     const { mastery } = parseMasteryMetrics(row?.metrics ?? '{}');
 *     snapshot.set(nodeId, mastery);
 *   }
 *   // 2. Build lookup
 *   const lookup = makeMasteryLookup(snapshot);
 *   // 3. Pass to route()
 *   const decision = route(entryNodeId, graph, lookup, antiLoopMemory);
 *   ```
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 *
 * ANTI-SHAME INVARIANT:
 *   The lookup is read-only. No write path exists. Returning `aggregate: 0` and
 *   `untouched: true` for an unknown node is the safe-degradation path — it
 *   causes routing to treat the node as a high-priority target, never as a penalty.
 */

import type { NodeId } from '@/core/types';
import type { MasteryMetrics } from '@/core/mastery/mastery-metrics';
import type { MasteryLookup, MasterySnapshot } from '@/core/routing/routing-types';

// ---------------------------------------------------------------------------
// makeMasteryLookup — the session-layer builder
// ---------------------------------------------------------------------------

/**
 * makeMasteryLookup(snapshot): MasteryLookup
 *
 * Builds a read-only `MasteryLookup` function from a pre-resolved snapshot
 * of `MasteryMetrics` per node.
 *
 * The session layer is responsible for building `snapshot` by calling
 * `getProgress` + `parseMasteryMetrics` for every node it will query, BEFORE
 * calling `route()`. This keeps `route()` pure and synchronous — it never
 * touches the persistence layer.
 *
 * READ-NOT-WRITE:
 *   The returned function is a plain reader — it has no write method or side
 *   effects. The `MasteryLookup` type carries no setter; `route()` cannot
 *   mutate any mastery state.
 *
 * SAFE DEGRADATION:
 *   If a node is absent from the snapshot (not pre-fetched, or a synthetic id
 *   in tests), the lookup returns `{ aggregate: 0, untouched: true }` — the
 *   weakest-possible value, causing routing to treat it as a high-priority
 *   unmastered prerequisite, never silently skipped.
 *
 * @param snapshot - A ReadonlyMap of NodeId → MasteryMetrics, pre-resolved by
 *                   the session layer from `getProgress` + `parseMasteryMetrics`.
 * @returns        - A `MasteryLookup` function suitable for passing to `route()`.
 */
export function makeMasteryLookup(
  snapshot: ReadonlyMap<NodeId, MasteryMetrics>
): MasteryLookup {
  /**
   * The returned lookup function. READ-ONLY — no write path, no setter method.
   *
   * Returns the `MasterySnapshot` for the given node, or the safe-degradation
   * default `{ aggregate: 0, untouched: true }` if the node is absent.
   */
  return function masteryLookup(nodeId: NodeId): MasterySnapshot {
    const metrics = snapshot.get(nodeId);
    if (metrics === undefined) {
      // Node not found in snapshot — treat as untouched (weakest possible).
      return { aggregate: 0, untouched: true };
    }

    // A node is `untouched` when no slice has any attempt data for any level.
    // We check window CONTENTS, not merely slice-key presence: a re-parsed
    // slice with an empty window (e.g. a malformed/seeded slot) must still
    // count as untouched. `some(s => s.window.length > 0)` is future-proof
    // against an empty-window slice yielding a false `untouched: false`.
    const hasAnyAttempt = Object.values(metrics.slices).some(
      (slice) => slice !== undefined && slice.window.length > 0
    );
    const untouched = !hasAnyAttempt;

    return {
      aggregate: metrics.aggregate,
      untouched,
    };
  };
}
