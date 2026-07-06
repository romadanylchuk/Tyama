/**
 * where-to-next.ts — Pure "where to next" priority merge (Stage 06, Phase 5).
 *
 * OWNED BY GAMIFICATION, NEVER READ OFF PREREQUISITE EDGES (brief §"Context"):
 *   `nextNode = diagnosticDebt ?? cappedDueReviews ?? curatedEntryPath`.
 *   The graph says what is POSSIBLE; this merge says what is WORTHWHILE next.
 *   The curated path is authored data (see `curated-path.ts`), never derived
 *   from the DAG's prerequisite edges.
 *
 * PRIORITY ORDER (highest first):
 *   1. `diagnosticDebt`   — an outstanding `route()` target the learner has not
 *      yet cleared THIS session (passed in by the session controller; this
 *      module never calls `route()` itself — Phase 6 owns that orchestration).
 *   2. `cappedDueReviews` — the `getDueNodes()` → `toReviewItem()` queue,
 *      capped at `sessionCap` (default `DUE_REVIEW_SESSION_CAP` from
 *      `@/motivation`) so spaced-repetition repetition can never dominate
 *      forward movement. `dueReviews` is expected pre-ordered
 *      most-overdue-first (the natural `getDueNodes()` ordering) — this
 *      function does not re-sort.
 *   3. `curatedEntryPath` — the first `CURATED_ENTRY_PATH` node that is BOTH
 *      not yet mastered (aggregate < the node's resolved `masteryThreshold`)
 *      AND not `'not-yet-open'` (a node can become `coming-soon` again if its
 *      generator is ever removed — the runtime check mirrors
 *      `validateCuratedPath`'s ship-time guard).
 *
 * NEVER THROWS:
 *   Returns `null` only when nothing is proposable — the caller renders a
 *   calm "all caught up" surface, never an empty/red state (anti-shame).
 *
 * PURE:
 *   No DB, no clock, no I/O. All state (mastery snapshot, due queue,
 *   diagnostic debt) is passed in by the caller (Phase 6 session controller).
 */

import type { NodeId, GraphDefinition } from '@/core/types';
import type { MasteryLookup } from '@/core/routing/routing-types';
import type { ReviewItem } from '@/core/spaced-repetition';
import { resolveMasteryConfig } from '@/core/mastery/mastery-config';
import { resolveAvailability } from '@/core/generators/registry';
import { DUE_REVIEW_SESSION_CAP } from '@/motivation/motivation-config';

// ---------------------------------------------------------------------------
// NextSource / WhereToNext — the pure output shape
// ---------------------------------------------------------------------------

/** Which priority tier produced the proposed next node. */
export type NextSource = 'diagnostic-debt' | 'due-review' | 'curated';

export interface WhereToNextResult {
  readonly nodeId: NodeId;
  readonly source: NextSource;
}

/** `null` means nothing is proposable right now (caller shows "all caught up"). */
export type WhereToNext = WhereToNextResult | null;

// ---------------------------------------------------------------------------
// WhereToNextInput
// ---------------------------------------------------------------------------

export interface WhereToNextInput {
  /**
   * An outstanding `route()` target the learner has not yet cleared this
   * session. `null`/`undefined` when there is no open diagnostic debt.
   * Built and tracked by the Phase-6 session controller — this module never
   * calls `route()` itself.
   */
  readonly diagnosticDebt?: NodeId | null;
  /**
   * The full due-review queue (`getDueNodes(now)` projected via
   * `toReviewItem`), expected pre-ordered most-overdue-first. This function
   * applies `sessionCap` internally — pass the UNCAPPED queue.
   */
  readonly dueReviews: readonly ReviewItem[];
  /**
   * The config-as-data curated entry path (typically `CURATED_ENTRY_PATH`
   * from `./curated-path`, but injectable for testing).
   */
  readonly curatedPath: readonly NodeId[];
  /** The active skill graph (from `loadGraph()`). */
  readonly graph: GraphDefinition;
  /** Read-only mastery reader (built by `makeMasteryLookup`). */
  readonly masteryLookup: MasteryLookup;
  /**
   * Overrides `DUE_REVIEW_SESSION_CAP` for testing. Defaults to the shipped
   * config-as-data value.
   */
  readonly sessionCap?: number;
}

// ---------------------------------------------------------------------------
// whereToNext — the pure priority merge
// ---------------------------------------------------------------------------

/**
 * whereToNext(input): WhereToNext
 *
 * Pure priority merge: `diagnosticDebt ?? cappedDueReviews ?? curatedEntryPath`.
 * Never throws; returns `null` when nothing is proposable.
 */
export function whereToNext(input: WhereToNextInput): WhereToNext {
  const { diagnosticDebt, dueReviews, curatedPath, graph, masteryLookup } = input;
  const sessionCap = input.sessionCap ?? DUE_REVIEW_SESSION_CAP;

  // Priority 1: diagnostic debt.
  if (diagnosticDebt) {
    return { nodeId: diagnosticDebt, source: 'diagnostic-debt' };
  }

  // Priority 2: capped due reviews. The cap bounds how many due items may ever
  // be considered THIS session — items beyond the cap remain scheduled and are
  // simply never surfaced here (no overflow/penalty UI; see feature-plan edge case).
  const cappedDueReviews = dueReviews.slice(0, Math.max(0, sessionCap));
  if (cappedDueReviews.length > 0) {
    return { nodeId: cappedDueReviews[0].nodeId, source: 'due-review' };
  }

  // Priority 3: curated entry path — first not-yet-mastered, not-yet-open-skipping node.
  const nodeIndex = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const availability = new Map(
    resolveAvailability(graph).map((a) => [a.nodeId, a.status] as const)
  );

  for (const nodeId of curatedPath) {
    // Skip a node that became not-yet-open — never propose an unreachable node
    // even if it was reachable when the curated path was authored (edge case).
    if (availability.get(nodeId) === 'coming-soon') continue;

    const node = nodeIndex.get(nodeId);
    if (node === undefined) continue; // defensive: absent from the current graph

    const { masteryThreshold } = resolveMasteryConfig(node);
    const { aggregate } = masteryLookup(nodeId);
    if (aggregate < masteryThreshold) {
      return { nodeId, source: 'curated' };
    }
    // Already mastered — skip forward to the next curated position.
  }

  // Nothing proposable — the caller renders a calm "all caught up", never an
  // empty/red state.
  return null;
}
