/**
 * ring-state.ts — Pure graded ring-state derivation (Stage 06, Phase 4).
 *
 * THE GAMIFICATION CORE IS THE SKILL GRAPH, MADE VISIBLE (brief §"Context"):
 *   `fill` is ALWAYS the raw stage-04 mastery `aggregate` scalar — there is no
 *   second progress source, no independently-tracked ring percentage. A
 *   novice on the CPA trajectory sees nonzero fill immediately.
 *
 * ANTI-SHAME INVARIANT (the load-bearing property of this module):
 *   The `RingState` union has NO 'locked' member and NO loss/decrease state.
 *   A windowed mastery scalar that eases back down below `masteryThreshold`
 *   simply returns to `'in-progress'` — never a special "you lost mastery"
 *   state, never a color/label change that reads as a penalty. This is
 *   asserted by `ring-state.test.ts` and (structurally + behaviorally) by the
 *   Phase-7 anti-shame guard.
 *
 * AVAILABILITY vs MASTERY — TWO INDEPENDENT INPUTS:
 *   `availability` (`'available' | 'coming-soon'`, from
 *   `@/core/generators/registry`'s `resolveAvailability`) gates `'not-yet-open'`
 *   regardless of any historical aggregate value (a node can theoretically
 *   have residual metrics from a since-removed generator; availability always
 *   wins so the UI never contradicts itself). Above that gate, the aggregate
 *   vs `masteryThreshold` comparison decides `'available' | 'in-progress' | 'mastered'`.
 */

import type { NodeAvailabilityStatus } from '@/core/generators/registry';
import type { MasteryConfig } from '@/core/mastery/mastery-config';

// ---------------------------------------------------------------------------
// RingState — the closed, anti-shame-vocabulary state union
// ---------------------------------------------------------------------------

/**
 * Closed union of graded ring states.
 *
 * ANTI-SHAME VOCABULARY: exactly these four values. Never 'locked' — a
 * padlock/'locked' label reads as "you haven't earned this" to an anxious
 * learner; `'not-yet-open'` is the only vocabulary for an unavailable node.
 */
export type RingState = 'not-yet-open' | 'available' | 'in-progress' | 'mastered';

export interface RingStateResult {
  readonly state: RingState;
  /** Always the raw aggregate scalar — never re-derived or clamped here. */
  readonly fill: number;
}

// ---------------------------------------------------------------------------
// deriveRingState — the pure derivation
// ---------------------------------------------------------------------------

/**
 * deriveRingState(aggregate, availability, config): RingStateResult
 *
 * Pure function — no DB, no clock, no I/O.
 *
 * @param aggregate    - The stage-04 mastery aggregate scalar (0..1) for this
 *                       node, as read from `parseMasteryMetrics(row.metrics).aggregate`
 *                       or `makeMasteryLookup(...)`. This becomes `fill` verbatim.
 * @param availability - `resolveAvailability(graph)` status for this node
 *                       (`'available'` = generator installed, `'coming-soon'` = not yet).
 * @param config       - `masteryThreshold` (and `minMasteryAttempts` when the
 *                       caller supplies `abstractAttempts`) — typically
 *                       `resolveMasteryConfig(node)` or `DEFAULT_MASTERY_CONFIG`,
 *                       so a per-node mastery-config override is honored automatically.
 * @param abstractAttempts - Optional evidence count: the abstract slice's
 *                       window length (see `masteryAttemptCount`). When
 *                       provided, 'mastered' additionally requires
 *                       `abstractAttempts >= config.minMasteryAttempts` — a
 *                       hot 2-answer aggregate stays honest 'in-progress'
 *                       until the evidence floor is met. Omitted (legacy
 *                       callers/tests): threshold-only behavior, unchanged.
 * @returns            - `{ state, fill }`. `fill` is always `aggregate`, unmodified.
 */
export function deriveRingState(
  aggregate: number,
  availability: NodeAvailabilityStatus,
  config: Pick<MasteryConfig, 'masteryThreshold'> & Partial<Pick<MasteryConfig, 'minMasteryAttempts'>>,
  abstractAttempts?: number
): RingStateResult {
  const fill = aggregate;

  if (availability === 'coming-soon') {
    // Availability always wins — a coming-soon node is muted regardless of
    // any residual aggregate value. Never 'locked'.
    return { state: 'not-yet-open', fill };
  }

  // Evidence floor: with the attempt count supplied, 'mastered' demands both
  // the threshold AND enough abstract-window evidence (anti-shame safe: the
  // withheld state is plain 'in-progress', never a loss/denied surface).
  const evidenceMet =
    abstractAttempts === undefined ||
    config.minMasteryAttempts === undefined ||
    abstractAttempts >= config.minMasteryAttempts;

  if (aggregate >= config.masteryThreshold && evidenceMet) {
    return { state: 'mastered', fill };
  }

  if (aggregate > 0) {
    // Covers BOTH "still building toward mastery" AND "eased back down below
    // threshold from a prior mastered state" — the anti-shame invariant means
    // there is no separate state for the latter. A scalar decrease renders as
    // ordinary in-progress, never a loss.
    return { state: 'in-progress', fill };
  }

  // Untouched (aggregate === 0) but available: never an empty/red "you have
  // nothing" state — plain 'available', fill 0 shown as not-yet-gained.
  return { state: 'available', fill };
}
