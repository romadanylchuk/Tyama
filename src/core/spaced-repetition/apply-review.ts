/**
 * apply-review.ts — Thin persistence write-path for banded spaced-repetition.
 *
 * This module is the IMPURE boundary that wires the pure `scheduleReview` seam
 * to the dumb persistence substrate. It is the sole place where a review outcome
 * is folded into `metrics.spacedRepetition` and written to the DB.
 *
 * BOUNDARY RESPONSIBILITY:
 *   `applyScheduledReview` moves an ALREADY-SCHEDULED node's band. It does NOT
 *   decide first-scheduling. The mastery gate (writing the first `dueAt` for a
 *   newly-mastered node) is stage-04's responsibility inside `ingestAttempt`.
 *   The caller (session layer / gate-crossing seam) is responsible for ensuring
 *   `applyScheduledReview` is only called for nodes that already have a `dueAt`.
 *
 * GATE-AGNOSTIC RULE:
 *   Both `applyScheduledReview` and `getDueNodes` are gate-agnostic — they
 *   never re-check `mastery_level`. The queue can never contain an unmastered
 *   node because nothing writes a first `dueAt` until the mastery gate crosses.
 *
 * WRITE-SIDE INVARIANTS (write-dueAt-never-mastery_level boundary):
 *   - Writes `dueAt` to the `due_at` column via `upsertNonMilestoneProgress`.
 *   - Writes `intervalBandIndex` and `lapses` into `metrics.spacedRepetition`.
 *   - NEVER touches `mastery_level` — that column belongs exclusively to the
 *     milestone gate (`recordMilestone` in milestone-gate.ts).
 *   - Preserves all other `metrics` keys (including `metrics.mastery`) via the
 *     `other` carry-through from `parseSpacedRepetition` / `serializeSpacedRepetition`.
 *
 * IMPURE BOUNDARY:
 *   The caller reads `Date.now()` ONCE and passes it as `nowMs`. This module
 *   never calls `Date.now()` — the impure boundary lives at the call site, not
 *   inside the deterministic core.
 *
 * NO COMPETING SEAM:
 *   The queue read remains `getDueNodes` (stage-01 partial-indexed `due_at` query).
 *   No new DB read is introduced here. The session cap is stage-06 (limit-free here).
 *
 * ANTI-SHAME:
 *   Nothing written here subtracts, penalises, or visibly signals failure.
 *   Demotion shifts exactly one band, clamped at 0; `lapses` is telemetry-only.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 */

import type { NodeId } from '@/db/types';
import { getProgress, upsertNonMilestoneProgress } from '@/repositories/progress-repository';
import { resolveSpacedRepetitionConfig } from '@/config/spaced-repetition';
import { scheduleReview } from './scheduler';
import type { ReviewOutcome, ScheduledFields } from './scheduler';
import { parseSpacedRepetition, serializeSpacedRepetition } from './scheduler-metrics';

// ---------------------------------------------------------------------------
// applyScheduledReview — the public thin write-path
// ---------------------------------------------------------------------------

/**
 * applyScheduledReview(nodeId, outcome, nowMs): Promise<ScheduledFields>
 *
 * Reads the current scheduler state for the node from persistence, runs the
 * pure `scheduleReview` function over the outcome, and writes the new
 * `dueAt` + `intervalBandIndex` (+ `lapses`) back to the DB.
 *
 * Steps:
 *   1. Read `getProgress(nodeId)` for the current `due_at` and `metrics` blob.
 *   2. Parse `metrics.spacedRepetition` (with other-key carry-through preserving
 *      `metrics.mastery` and any other co-resident keys).
 *   3. Build `current: ScheduledFields` from the parsed slice and the current `dueAt`.
 *   4. Resolve the scheduler config (global default, future per-node override).
 *   5. Call the PURE `scheduleReview(current, outcome, nowMs, config)` → `next`.
 *   6. Serialize the new slice back into the full metrics blob (carry-through).
 *   7. Persist via `upsertNonMilestoneProgress` — writes `dueAt` to the `due_at`
 *      column and serialized metrics to the `metrics` column; NEVER touches
 *      `mastery_level`.
 *   8. Return the new `ScheduledFields` (for the caller to observe / log).
 *
 * GATE NOTE:
 *   This function only moves an already-scheduled node's band. It does NOT
 *   enforce or apply the mastery gate (first-scheduling on abstract-gate
 *   crossing is stage-04's job). Call this only after confirming `dueAt` is
 *   already set (i.e., the node was previously scheduled by the gate).
 *
 * @param nodeId  - Stable skill-graph node identifier.
 * @param outcome - Raw review outcome (correct + elapsed + target timing).
 * @param nowMs   - Current epoch ms (read `Date.now()` ONCE at the call site).
 * @returns       - The new `ScheduledFields` after scheduling.
 */
export async function applyScheduledReview(
  nodeId: NodeId,
  outcome: ReviewOutcome,
  nowMs: number
): Promise<ScheduledFields> {
  // ---- Step 1: Read current progress row --------------------------------
  const row = await getProgress(nodeId);
  const metricsJson = row?.metrics ?? '{}';

  // ---- Step 2: Parse metrics (other-key carry-through) ------------------
  //   `other` includes `mastery` (stage-04's key) and any future keys.
  //   Passing `other` to `serializeSpacedRepetition` is MANDATORY so that
  //   `metrics.mastery` survives this write unchanged.
  const { spacedRepetition, other } = parseSpacedRepetition(metricsJson);

  // ---- Step 3: Build current ScheduledFields ----------------------------
  //   When the node has no existing `dueAt` (e.g. first-ever band-move,
  //   defensive fallback), treat `nowMs` as the baseline so the new `dueAt`
  //   is computed relative to now rather than an arbitrary past epoch.
  const current: ScheduledFields = {
    dueAt: row?.dueAt ?? nowMs,
    intervalBandIndex: spacedRepetition.intervalBandIndex,
    lapses: spacedRepetition.lapses,
  };

  // ---- Step 4: Resolve config -------------------------------------------
  const config = resolveSpacedRepetitionConfig();

  // ---- Step 5: Pure scheduling ------------------------------------------
  const next = scheduleReview(current, outcome, nowMs, config);

  // ---- Step 6: Serialize (merge back into full blob) --------------------
  //   Extract only the mutable fields that belong to `metrics.spacedRepetition`.
  //   `lapses` travels with `intervalBandIndex` for telemetry purposes.
  const nextSlice = {
    intervalBandIndex: next.intervalBandIndex,
    lapses: next.lapses,
  };
  const nextMetrics = serializeSpacedRepetition(other, nextSlice);

  // ---- Step 7: Persist (write dueAt + metrics; NEVER mastery_level) -----
  //   Explicitly supplying `dueAt` (not absent from the object) so that the
  //   `upsertNonMilestoneProgress` "dueAt key present" branch writes the
  //   column directly — the COALESCE path would silently preserve the old value.
  await upsertNonMilestoneProgress({
    nodeId,
    dueAt: next.dueAt,
    metrics: nextMetrics,
  });

  // ---- Step 8: Return new state to caller --------------------------------
  return next;
}
