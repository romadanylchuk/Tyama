/**
 * route.ts — Pure `route()` traversal for stage-04 diagnostic loop.
 *
 * This is the product's core diagnostic seam: given the symptom node where a
 * learner failed, traverse the prerequisite DAG backward to find the CAUSAL
 * root — the deepest unmastered prerequisite — and return a `RoutingDecision`.
 *
 * PURITY GUARANTEE:
 *   `route()` is a pure, synchronous, DB-free function. It imports NOTHING from
 *   '@/db', '@/repositories', or any I/O module. Its only mastery channel is
 *   the `MasteryLookup` parameter (read-only by type — no setter exists).
 *
 * READ-NOT-WRITE BOUNDARY (structural, enforced by type):
 *   `route()` receives a `MasteryLookup` (a plain read-only function) and
 *   NEVER writes mastery state. The boundary is enforced structurally: the type
 *   carries no write path, so a mutation would be a compile error, not a runtime
 *   convention.
 *
 * ANTI-SHAME INVARIANTS (structural throughout):
 *   - Every `RoutingReason` is a FORWARD framing (firm up the foundation, try a
 *     different way). None represents demotion, penalty, loss, or subtraction.
 *   - `AntiLoopMemory` is READ by `route()` — the session layer writes to it
 *     AFTER acting on the decision. `route()` never mutates its inputs.
 *   - `AntiLoopMemory` is never persisted (session-scoped, discarded at end).
 *
 * TRAVERSAL ALGORITHM (D3 — locked):
 *   Bounded iterative DFS (not recursion) over `GraphNode.prerequisites`.
 *   At each node:
 *     1. Collect all unmastered prerequisites (aggregate < masteryThreshold).
 *     2. If zero unmastered → 'symptom-is-target' (local gap, not missing prereq).
 *     3. If ≥1 unmastered → descend into the WEAKEST (lowest aggregate);
 *        untouched nodes (no data) are ranked weakest.
 *     4. On genuine tie (≥2 unmastered with equal aggregate, incl. all-zero):
 *        'probe' — choose lowest-id tiebreak; stop here.
 *     5. At the leaf (deepest unmastered with no further unmastered prereqs):
 *        'deepest-unmastered'.
 *   Anti-loop: if the freshly-routed target was already recently routed to:
 *     - Has deeper unmastered prereqs → 'descend-further' (anti-loop fires, continue).
 *     - No deeper prereqs → 'escalate' (emit ExplanationContext with priorApproach).
 *
 * DESCENTPATH:
 *   `descentPath` is an array from `entry` (inclusive) down to `target` (inclusive).
 *   Length 1 means the target IS the entry (symptom-is-target, probe, escalate).
 *   Stage 06 uses this for staged-descent narrative framing.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 *
 * LANGUAGE-NEUTRAL:
 *   No field here carries a localized string. All text resolution happens in
 *   the stage-06 presentation layer.
 */

import type { NodeId, GraphDefinition, GraphNode } from '@/core/types';
import type {
  MasteryLookup,
  MasterySnapshot,
  RoutingDecision,
  RoutingReason,
  ReadonlyAntiLoopMemory,
  AntiLoopEntry,
  AntiLoopDirective,
  ExplanationContext,
} from '@/core/routing/routing-types';
import { resolveMasteryConfig } from '@/core/mastery/mastery-config';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a Map<NodeId, GraphNode> index for O(1) node lookups during traversal.
 */
function buildNodeIndex(graph: GraphDefinition): Map<NodeId, GraphNode> {
  const index = new Map<NodeId, GraphNode>();
  for (const node of graph.nodes) {
    index.set(node.id, node);
  }
  return index;
}

/**
 * Resolve the mastery threshold for a given node.
 *
 * Falls back to 0.80 (DEFAULT_MASTERY_CONFIG.masteryThreshold) when the node
 * is absent from the graph (defensive — graph is validated at startup).
 */
function resolveThreshold(nodeId: NodeId, nodeIndex: Map<NodeId, GraphNode>): number {
  const node = nodeIndex.get(nodeId);
  if (node === undefined) {
    // Defensive fallback — graph validated at startup; this should not occur.
    return 0.8;
  }
  return resolveMasteryConfig(node).masteryThreshold;
}

/**
 * Determine whether a node is unmastered for routing purposes.
 *
 * A node is unmastered when its `aggregate` mastery scalar is below the
 * node's resolved `masteryThreshold` (config-as-data, per-node override allowed).
 *
 * Untouched nodes (no attempt history) return aggregate=0 from the lookup,
 * which is always below threshold — they are always considered unmastered.
 */
function isUnmastered(
  nodeId: NodeId,
  masteryLookup: MasteryLookup,
  nodeIndex: Map<NodeId, GraphNode>
): boolean {
  const threshold = resolveThreshold(nodeId, nodeIndex);
  const { aggregate } = masteryLookup(nodeId);
  return aggregate < threshold;
}

/**
 * Select the single weakest candidate from ≥1 unmastered prerequisites.
 *
 * Ranking rule:
 *   1. Untouched nodes (snapshot.untouched === true) always rank weakest (0 aggregate,
 *      and the untouched flag gives them priority over in-progress-but-low nodes).
 *   2. Among non-untouched: lower aggregate = weaker.
 *   3. On tie (equal aggregate including all-zero), return null — caller emits 'probe'.
 *      Tiebreak determinism: if all are equal but some are untouched and some are
 *      in-progress, untouched wins. If ALL are equal (all untouched or all same
 *      aggregate, with no untouched vs in-progress distinction), it is a true tie.
 *
 * Returns the NodeId of the unique weakest, or null on a genuine tie.
 */
function selectWeakest(
  candidates: NodeId[],
  masteryLookup: MasteryLookup
): NodeId | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Compute snapshot for each candidate.
  const snapshots: { id: NodeId; snapshot: MasterySnapshot }[] = candidates.map((id) => ({
    id,
    snapshot: masteryLookup(id),
  }));

  // Separate untouched from in-progress.
  const untouched = snapshots.filter((c) => c.snapshot.untouched);
  const inProgress = snapshots.filter((c) => !c.snapshot.untouched);

  // Any untouched nodes rank weakest. If only one untouched → clear winner.
  if (untouched.length === 1) return untouched[0].id;
  // Multiple untouched → tie among untouched (all aggregate=0, untouched=true).
  if (untouched.length > 1) return null;

  // No untouched nodes → compare by aggregate.
  const minAggregate = Math.min(...inProgress.map((c) => c.snapshot.aggregate));
  const weakest = inProgress.filter((c) => c.snapshot.aggregate === minAggregate);

  if (weakest.length === 1) return weakest[0].id;
  // Genuine tie among in-progress nodes at the same aggregate.
  return null;
}

/**
 * Choose a deterministic tiebreak target from a tied candidate list.
 *
 * Uses lexicographic lowest id so the choice is stable across calls with the
 * same inputs (pure function property). Stage 06 selects the actual probe task.
 */
function tiebreakTarget(candidates: NodeId[]): NodeId {
  return [...candidates].sort()[0];
}

// ---------------------------------------------------------------------------
// route() — the public pure traversal function
// ---------------------------------------------------------------------------

/**
 * route(entrySkillNode, graph, masteryLookup, antiLoopMemory): RoutingDecision
 *
 * The pure diagnostic routing function. Given the skill node where a learner
 * failed (the symptom), traverses the prerequisite DAG backward to find the
 * deepest unmastered causal root, and returns a `RoutingDecision`.
 *
 * PURITY: no DB, no clock, no I/O, no mutation of inputs. All state is passed
 * in and only the returned `RoutingDecision` carries the output.
 *
 * READ-NOT-WRITE: `masteryLookup` is a plain read-only function; `antiLoopMemory`
 * is read (via `Map.get`) but NEVER written — the session layer writes to it
 * AFTER acting on the returned decision.
 *
 * ANTI-SHAME: every `RoutingReason` is a forward framing. `descentPath` enables
 * staged-descent narrative ("let's firm up X before Y") in stage 06 — it is never
 * a shame surface itself.
 *
 * @param entrySkillNode - The node where the learner failed (the symptom).
 * @param graph          - The active skill graph (from `loadGraph()`).
 * @param masteryLookup  - Read-only mastery reader (built by `makeMasteryLookup`).
 * @param antiLoopMemory - Session-scoped anti-loop memory, typed
 *                         `ReadonlyAntiLoopMemory` — route() can only READ it
 *                         (compile-time enforced). The session layer holds the
 *                         mutable `AntiLoopMemory` and writes to it after acting.
 * @returns              - A `RoutingDecision` describing where to send the learner.
 */
export function route(
  entrySkillNode: NodeId,
  graph: GraphDefinition,
  masteryLookup: MasteryLookup,
  antiLoopMemory: ReadonlyAntiLoopMemory
): RoutingDecision {
  // -------------------------------------------------------------------------
  // Step 1: Build node index for O(1) lookups.
  // -------------------------------------------------------------------------
  const nodeIndex = buildNodeIndex(graph);

  // -------------------------------------------------------------------------
  // Step 2: Anti-loop check on the ENTRY node.
  //
  // If the learner was already recently routed to `entrySkillNode` and broke
  // again, the anti-loop fires BEFORE the normal traversal.
  // -------------------------------------------------------------------------
  const entryMemory: AntiLoopEntry | undefined = antiLoopMemory.get(entrySkillNode);
  if (entryMemory !== undefined && entryMemory.visits >= 1) {
    return handleAntiLoop(
      entrySkillNode,
      entryMemory,
      graph,
      masteryLookup,
      nodeIndex,
      [entrySkillNode]
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: Normal bounded iterative DFS descent.
  //
  // We descend from `entrySkillNode` into unmastered prerequisites, choosing
  // the weakest at each fork. A visited-set guards against pathological graph
  // inputs (the graph is a validated DAG, so descent terminates; the guard
  // catches future asset defects before they hang).
  // -------------------------------------------------------------------------
  const descentPath: NodeId[] = [entrySkillNode];
  const visited = new Set<NodeId>([entrySkillNode]);

  // Defensive bound: number of nodes in the graph + 1 as max descent depth.
  const maxDepth = graph.nodes.length + 1;

  let current: NodeId = entrySkillNode;

  for (let depth = 0; depth < maxDepth; depth++) {
    const node = nodeIndex.get(current);
    if (node === undefined) {
      // Node absent from graph — treat as leaf (no further prerequisites).
      break;
    }

    // Collect unmastered prerequisites at this node.
    const unmasteredPrereqs = node.prerequisites.filter(
      (prereqId) =>
        !visited.has(prereqId) && isUnmastered(prereqId, masteryLookup, nodeIndex)
    );

    if (unmasteredPrereqs.length === 0) {
      // All prerequisites mastered (or none exist) — stop here.
      break;
    }

    // Select the single weakest unmastered prerequisite.
    const weakest = selectWeakest(unmasteredPrereqs, masteryLookup);

    if (weakest === null) {
      // Genuine tie — emit 'probe' at the CURRENT node (not entry).
      // The probe target is the tied candidate chosen by deterministic tiebreak.
      // We descend into the probe node (it becomes the target).
      const probeTarget = tiebreakTarget(unmasteredPrereqs);
      descentPath.push(probeTarget);
      return {
        target: probeTarget,
        descentPath: descentPath as readonly NodeId[],
        reason: 'probe' as RoutingReason,
      };
    }

    // Descend into the weakest unmastered prerequisite.
    visited.add(weakest);
    descentPath.push(weakest);
    current = weakest;
  }

  // -------------------------------------------------------------------------
  // Step 4: Classify the terminal node.
  // -------------------------------------------------------------------------
  const terminalNode = descentPath[descentPath.length - 1];

  if (terminalNode === entrySkillNode) {
    // We did not descend at all — all prerequisites of the entry were mastered
    // (or the entry has no prerequisites). The entry IS the target.
    return {
      target: entrySkillNode,
      descentPath: [entrySkillNode] as readonly NodeId[],
      reason: 'symptom-is-target' as RoutingReason,
    };
  }

  // We descended to `terminalNode` — the deepest unmastered prerequisite.
  // Anti-loop check on the TERMINAL node.
  const terminalMemory: AntiLoopEntry | undefined = antiLoopMemory.get(terminalNode);
  if (terminalMemory !== undefined && terminalMemory.visits >= 1) {
    return handleAntiLoop(
      terminalNode,
      terminalMemory,
      graph,
      masteryLookup,
      nodeIndex,
      descentPath
    );
  }

  return {
    target: terminalNode,
    descentPath: descentPath as readonly NodeId[],
    reason: 'deepest-unmastered' as RoutingReason,
  };
}

// ---------------------------------------------------------------------------
// handleAntiLoop — anti-loop branch logic
// ---------------------------------------------------------------------------

/**
 * Handle the anti-loop case when a target node was recently routed to.
 *
 * Decision:
 *   - If the node has unmastered prerequisites not in the current path:
 *     descend further into the weakest one → reason 'descend-further'.
 *   - Otherwise (leaf, or no unmastered prereqs below):
 *     escalate → reason 'escalate' with ExplanationContext + priorApproach.
 *
 * ANTI-SHAME: 'descend-further' and 'escalate' are both forward framings.
 * The ExplanationContext carries priorApproach so the explanation can
 * deliberately differ from what was already tried — "never the same approach twice."
 *
 * @param nodeId       - The node where anti-loop fired.
 * @param entry        - The anti-loop memory entry for this node.
 * @param graph        - Active skill graph.
 * @param masteryLookup - Read-only mastery reader.
 * @param nodeIndex    - Pre-built node index.
 * @param currentPath  - descentPath built so far (will be extended on descend-further).
 * @returns            - The RoutingDecision (descend-further or escalate).
 */
function handleAntiLoop(
  nodeId: NodeId,
  entry: AntiLoopEntry,
  graph: GraphDefinition,
  masteryLookup: MasteryLookup,
  nodeIndex: Map<NodeId, GraphNode>,
  currentPath: NodeId[]
): RoutingDecision {
  const node = nodeIndex.get(nodeId);
  const unmasteredPrereqs: NodeId[] = node !== undefined
    ? node.prerequisites.filter((pid) => isUnmastered(pid, masteryLookup, nodeIndex))
    : [];

  // Visits >= 2: always escalate (repeat-budget exhausted, even if prereqs exist).
  // Visits == 1: descend-further if unmastered prereqs exist; else escalate.
  const shouldEscalate = entry.visits >= 2 || unmasteredPrereqs.length === 0;

  const antiLoopDirective: AntiLoopDirective = {
    priorTarget: nodeId,
    escalateToExplanation: shouldEscalate,
    ...(shouldEscalate
      ? {
          explanationContext: buildEscalationContext(nodeId, entry),
        }
      : {}),
  };

  if (!shouldEscalate) {
    // Descend further: pick the weakest unmastered prerequisite below.
    const weakest = selectWeakest(unmasteredPrereqs, masteryLookup);
    const furtherTarget = weakest ?? tiebreakTarget(unmasteredPrereqs);
    const extendedPath: readonly NodeId[] = [...currentPath, furtherTarget];

    return {
      target: furtherTarget,
      descentPath: extendedPath,
      reason: 'descend-further' as RoutingReason,
      antiLoop: antiLoopDirective,
    };
  }

  // Escalate: target stays at nodeId (no further descent); return escalation signal.
  return {
    target: nodeId,
    descentPath: currentPath as readonly NodeId[],
    reason: 'escalate' as RoutingReason,
    antiLoop: antiLoopDirective,
  };
}

/**
 * Build the minimal ExplanationContext for an anti-loop escalation.
 *
 * Most fields are `unknown` (per DL-5: stage 06 pins exact types).
 * The `priorApproach` is the one additive field this stage owns.
 *
 * LANGUAGE-NEUTRAL: no localized strings; all text resolution is in stage 06.
 */
function buildEscalationContext(
  nodeId: NodeId,
  entry: AntiLoopEntry
): ExplanationContext {
  return {
    problem: undefined,
    studentAnswer: undefined,
    correctAnswer: undefined,
    method: undefined,
    steps: undefined,
    failedStep: undefined,
    skillNode: nodeId,
    language: '',
    priorApproach: {
      target: nodeId,
      reason: 'escalate' as RoutingReason,
      // Note: we use 'escalate' here as the reason for the prior approach,
      // reflecting that this escalation happened at this node. Stage 06 may
      // override with more specific context when the full ExplanationContext
      // is wired up (DL-5).
    },
  };
}
