/**
 * ingest-attempt.ts — The single persistence-touching seam for per-attempt
 * mastery ingestion (Phase 3, Stage 04).
 *
 * `ingestAttempt` is THE place per-attempt speed + representationLevel enter
 * the mastery system. It is the only site in stage-04 code that:
 *   1. Reads persisted progress (`getProgress`).
 *   2. Calls the pure mastery engine to recompute the rolling-window scalar.
 *   3. Persists the updated `metrics.mastery` blob via `upsertNonMilestoneProgress`.
 *   4. Fires `recordMilestone` on the FIRST abstract-slice crossing of
 *      `masteryThreshold` (idempotent; never re-fires on subsequent crossings).
 *
 * CALLER CONTRACT (session-layer):
 *   Call `ingestAttempt` ONLY when `CheckResult.outcome !== 'parse-error'`.
 *   The `AttemptOutcome` type ('correct' | 'failed-step') structurally excludes
 *   parse-errors — a `ParseError` carries no `skillNode` and is incapable of
 *   routing. This constraint is enforced at the type level; no runtime guard is
 *   needed inside this function.
 *
 * WHAT IS NEVER WRITTEN HERE:
 *   - The `mastery_level` INTEGER column — that belongs exclusively to the
 *     milestone gate (`recordMilestone`). `upsertNonMilestoneProgress` is the
 *     only persistence call this seam makes for the rolling-window update.
 *   - The firehose — `ingestAttempt` does not append any firehose event for
 *     scoring purposes. The session layer may do so separately if desired.
 *
 * ABSTRACT-GATE HAND-OFF (idempotency):
 *   When the abstract slice's scalar crosses `masteryThreshold` for the FIRST
 *   time (pre-update scalar < threshold AND post-update scalar >= threshold),
 *   `recordMilestone({ kind: 'first_node_mastered', nodeId })` is called.
 *   The gate's own MAX-guard on `mastery_level` is the backstop for any race.
 *   Re-crossings (pre-update abstract scalar already >= threshold) do NOT
 *   re-fire — detected via the pre/post scalar comparison (DL-2).
 *
 * TWO VERSION AXES UNTOUCHED:
 *   No code path here reads/writes PRAGMA user_version or graphVersion.
 *
 * ANTI-SHAME INVARIANT:
 *   Speed is an up-force only (floor-bounded by speedFloor); a slow correct
 *   attempt never zeroes the scalar. An error contributes accuracy=0 to the
 *   rolling window but never subtracts from milestones, mastery_level, or XP.
 *   Nothing in this module demotes, evicts, or punishes.
 */

import { loadGraph } from '@/core/graph/load-graph';
import {
  resolveMasteryConfig,
  DEFAULT_MASTERY_CONFIG,
} from '@/core/mastery/mastery-config';
import {
  parseMasteryMetrics,
  serializeMasteryMetrics,
} from '@/core/mastery/mastery-metrics';
import {
  rawAttemptScalar,
  pushAttempt,
} from '@/core/mastery/mastery-engine';
import { getProgress, upsertNonMilestoneProgress } from '@/repositories/progress-repository';
import { recordMilestone } from '@/repositories/milestone-gate';
import type { NodeId, RepresentationLevel } from '@/core/types';
import type { MasteryConfig } from '@/core/mastery/mastery-config';

// ---------------------------------------------------------------------------
// AttemptOutcome — closed union (parse-error is structurally excluded)
// ---------------------------------------------------------------------------

/**
 * The outcome of a checked attempt that can be ingested into the mastery system.
 *
 * PARSE-ERROR IS EXCLUDED:
 *   A `ParseError` (from stage-03 `checkAnswer`) carries no `skillNode` — it is
 *   structurally incapable of becoming a routing or mastery event. The session
 *   layer MUST drop parse-error `CheckResult`s before calling `ingestAttempt`.
 *   This type enforces that contract at the call site: only 'correct' and
 *   'failed-step' are accepted.
 */
export type AttemptOutcome = 'correct' | 'failed-step';

// ---------------------------------------------------------------------------
// AttemptRecord — the full input to ingestAttempt
// ---------------------------------------------------------------------------

/**
 * A single checked attempt ready for mastery ingestion.
 *
 * `skillNode`          — the graph node the attempt exercised.
 * `representationLevel`— the CPA level (concrete | pictorial | abstract).
 * `outcome`            — 'correct' (accuracy 1) or 'failed-step' (accuracy 0).
 *                        'parse-error' is NOT representable here by design.
 * `elapsedMs`          — wall-clock time the learner spent on this attempt.
 *                        Used by `speedFactor`; floor-bounded in the engine.
 */
export interface AttemptRecord {
  readonly skillNode: NodeId;
  readonly representationLevel: RepresentationLevel;
  readonly outcome: AttemptOutcome;
  readonly elapsedMs: number;
}

// ---------------------------------------------------------------------------
// ingestAttempt — the seam
// ---------------------------------------------------------------------------

/**
 * ingestAttempt(attempt): Promise<void>
 *
 * The single place per-attempt speed + representationLevel enter the mastery
 * system. Reads `getProgress`, computes the updated rolling-window scalar via
 * the pure engine, persists via `upsertNonMilestoneProgress`, and fires the
 * abstract-gate `recordMilestone` hand-off on first crossing (idempotent).
 *
 * CALLER CONTRACT:
 *   Only call this when `CheckResult.outcome !== 'parse-error'`. The
 *   `AttemptOutcome` type structurally enforces this — parse-error is not
 *   a member of the union.
 *
 * SIDE EFFECTS:
 *   1. `upsertNonMilestoneProgress` — always (writes updated metrics JSON).
 *   2. `recordMilestone` — at most once per node (first abstract-gate crossing).
 *
 * @param attempt - The checked attempt record to ingest.
 */
export async function ingestAttempt(attempt: AttemptRecord): Promise<void> {
  const { skillNode, representationLevel, outcome, elapsedMs } = attempt;

  // --- Step 1: Resolve the node's mastery config ----------------------------
  // Load the graph and find the node. Fall back to DEFAULT_MASTERY_CONFIG
  // defensively if the node is absent (e.g. test fixtures with synthetic ids).
  const config: MasteryConfig = resolveConfig(skillNode);

  // --- Step 2: Read current persisted progress ------------------------------
  const row = await getProgress(skillNode);
  const metricsJson = row?.metrics ?? '{}';

  // --- Step 3: Parse the metrics blob ---------------------------------------
  const { mastery, other } = parseMasteryMetrics(metricsJson);

  // --- Step 4: Capture the pre-update abstract scalar (for gate detection) --
  // Used below to detect the FIRST abstract-slice crossing of masteryThreshold.
  const priorAbstractScalar = mastery.slices.abstract?.scalar ?? 0;

  // --- Step 5: Compute the raw scalar and push to the rolling window --------
  const accuracy: 0 | 1 = outcome === 'correct' ? 1 : 0;
  const raw = rawAttemptScalar(accuracy, elapsedMs, representationLevel, config);
  const next = pushAttempt(mastery, representationLevel, raw, config);

  // --- Step 6: Persist the updated metrics via the non-milestone path -------
  // NEVER writes mastery_level — that column is owned exclusively by recordMilestone.
  await upsertNonMilestoneProgress({
    nodeId: skillNode,
    metrics: serializeMasteryMetrics(other, next),
  });

  // --- Step 7: Abstract-gate milestone hand-off (idempotent) ----------------
  // First-crossing detection per DL-2: the crossing happened if and only if:
  //   - the updated abstract scalar is at or above the threshold (gate met), AND
  //   - the prior abstract scalar was below the threshold (first crossing, not a re-cross).
  // The gate's MAX-guard on mastery_level is the backstop for any race.
  if (representationLevel === 'abstract') {
    const nextAbstractScalar = next.slices.abstract?.scalar ?? 0;
    const isFirstCrossing =
      priorAbstractScalar < config.masteryThreshold &&
      nextAbstractScalar >= config.masteryThreshold;

    if (isFirstCrossing) {
      await recordMilestone({
        kind: 'first_node_mastered',
        nodeId: skillNode,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the mastery config for a node id, with a defensive fallback.
 *
 * Looks up the node in the loaded graph. If the node is absent (e.g. a
 * synthetic test id or an OTA graph that dropped a node), falls back to
 * `DEFAULT_MASTERY_CONFIG` rather than throwing.
 */
function resolveConfig(skillNode: NodeId): MasteryConfig {
  const graph = loadGraph();
  const node = graph.nodes.find((n) => n.id === skillNode);
  if (node === undefined) {
    // Defensive fallback: the node is absent from the graph. This should not
    // happen in production (validated at startup by validateGraph), but can
    // happen in tests with synthetic node ids or OTA graph transitions.
    return DEFAULT_MASTERY_CONFIG;
  }
  return resolveMasteryConfig(node);
}
