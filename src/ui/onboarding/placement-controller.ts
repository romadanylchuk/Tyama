/**
 * placement-controller.ts — RN-free onboarding placement ladder orchestrator
 * (stage 07, Phase 2).
 *
 * KEPT INJECTABLE / RN-FREE ON PURPOSE (mirrors
 * `src/ui/task-screen/session-controller.ts`):
 *   No React import anywhere in this file. `PlacementController` is a plain
 *   class over the stage-01/02/04 seams, unit-testable with an injected test
 *   DB and reused (unchanged) by the Phase-4 `PlacementScreen.tsx`.
 *
 * THE SOLE STRUCTURAL DOOR — NEVER A MILESTONE, NEVER A ROUTE-WRITE:
 *   Every seed this controller writes goes through
 *   `upsertNonMilestoneProgress` (never `recordMilestone`) and every entry
 *   node it sets goes through `settings.set('currentNodeId', …)` (never a
 *   call into `@/core/routing`). This module deliberately imports ONLY:
 *   `@/repositories/progress-repository`, `@/repositories/settings-repository`,
 *   `@/core/mastery/*`, `@/core/graph/load-graph`, and `@/config/placement`
 *   (plus the local, pure `./placement-seed`). It imports neither
 *   `milestone-gate` nor `@/core/routing` — asserted structurally by
 *   `placement-controller.test.ts`.
 *
 * ASCENT, NOT DESCENT — "LOW AND RISING IS NON-SHAMING":
 *   `recordProbe({ kind: 'correct' })` seeds the current ascent-chain node
 *   (via `buildPlacementSeed`, capped strictly below `masteryThreshold`) and
 *   advances to the next node up the chain. The ladder runs at most
 *   `min(config.probeCount, config.ascentChain.length)` probes.
 *
 *   `recordProbe({ kind: 'failed-step' })` is the FIRST non-success: it stops
 *   the ladder immediately, non-shamingly. Nothing is seeded for the failing
 *   node or any node after it, and nothing already seeded is ever lowered.
 *   The failing node itself becomes the ceiling — and therefore the entry
 *   node `finish()` returns — because it is exactly the skill the learner
 *   needs more practice on next (the diagnostic-loop philosophy applied to
 *   placement).
 *
 *   `recordProbe({ kind: 'parse-error' })` is a gentle re-prompt: the SAME
 *   probe is re-collected next time (the ladder index does not advance), and
 *   nothing is written — exactly mirroring a real session's parse-error
 *   handling (a format slip is never a routing signal).
 *
 * PLACEMENT NEVER NULLABLE, ALWAYS SHORTENABLE:
 *   `finish()` always returns a real `NodeId` and always sets
 *   `settings.currentNodeId` to it — the last node the ladder touched (seeded
 *   on success, or the failing/ceiling node), or `config.floorNodeId` if the
 *   ladder never ran at all. `skipToFloor()` writes ZERO `progress` rows and
 *   sets `currentNodeId = config.floorNodeId` — architecturally identical to
 *   a brand-new learner's untouched default (`aggregate 0 → band 0`), which
 *   is exactly why nulling is unnecessary and forbidden.
 */

import { getProgress, upsertNonMilestoneProgress } from '@/repositories/progress-repository';
import { settings } from '@/repositories/settings-repository';
import { resolveMasteryConfig } from '@/core/mastery/mastery-config';
import { parseMasteryMetrics, serializeMasteryMetrics } from '@/core/mastery/mastery-metrics';
import { loadGraph } from '@/core/graph/load-graph';
import { PLACEMENT_CONFIG, type PlacementConfig } from '@/config/placement';
import { buildPlacementSeed } from './placement-seed';
import type { GraphNode, NodeId } from '@/core/types';

// ---------------------------------------------------------------------------
// ProbeOutcome — the three possible results of one placement probe
// ---------------------------------------------------------------------------

export type ProbeOutcome =
  | { readonly kind: 'correct' }
  | { readonly kind: 'failed-step' }
  | { readonly kind: 'parse-error' };

// ---------------------------------------------------------------------------
// PlacementController — public contract
// ---------------------------------------------------------------------------

export interface PlacementController {
  /**
   * The node the next probe should be generated for, or `null` when the
   * ladder has finished (either every configured probe was answered
   * correctly, or a `failed-step` stopped it early).
   */
  currentProbeNode(): NodeId | null;

  /**
   * Record the outcome of the current probe.
   *   - `'correct'`   — seeds the current node (never lowers a prior
   *                     aggregate) and advances the ladder.
   *   - `'failed-step'` — stops the ladder immediately; seeds nothing.
   *   - `'parse-error'` — a no-op re-prompt; the same probe is re-collected
   *                       next time (nothing is written, the index does not
   *                       advance).
   * A no-op (returns immediately) once the ladder has already finished.
   */
  recordProbe(outcome: ProbeOutcome): Promise<void>;

  /**
   * Finish the placement flow: sets `settings.currentNodeId` to the node the
   * ladder stopped at (or `floorNodeId` if no probe was ever recorded) and
   * returns it. NEVER returns/sets `null`.
   */
  finish(): Promise<NodeId>;

  /**
   * Skip placement entirely (0 probes). Writes ZERO `progress` rows and sets
   * `currentNodeId = floorNodeId` — the natural fresh-learner default.
   */
  skipToFloor(): Promise<NodeId>;
}

// ---------------------------------------------------------------------------
// PlacementControllerImpl
// ---------------------------------------------------------------------------

class PlacementControllerImpl implements PlacementController {
  private readonly config: PlacementConfig;
  private readonly nodesById: ReadonlyMap<NodeId, GraphNode>;
  /** min(probeCount, ascentChain.length) — the ladder never runs past either bound. */
  private readonly ladderLength: number;

  /** Index into `config.ascentChain` of the next probe to present. */
  private index = 0;
  /** Set once the ladder stops (natural completion or a failed-step). */
  private finished = false;
  /** The last node the ladder actually touched — seeded on success, or the
   *  ceiling node on a failed-step. `null` until the first probe resolves. */
  private lastTouchedNode: NodeId | null = null;

  constructor(config: PlacementConfig) {
    this.config = config;
    const graph = loadGraph();
    this.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    this.ladderLength = Math.min(config.probeCount, config.ascentChain.length);
  }

  currentProbeNode(): NodeId | null {
    if (this.finished || this.index >= this.ladderLength) {
      return null;
    }
    return this.config.ascentChain[this.index] ?? null;
  }

  async recordProbe(outcome: ProbeOutcome): Promise<void> {
    const node = this.currentProbeNode();
    if (node === null) {
      // Ladder already finished (or never started) — defensive no-op.
      return;
    }

    if (outcome.kind === 'parse-error') {
      // Gentle re-prompt: same probe, not consumed, nothing written.
      return;
    }

    if (outcome.kind === 'failed-step') {
      // First non-success stops the ladder, non-shamingly. Seeds nothing;
      // this node becomes the ceiling — and the entry node `finish()` returns.
      this.lastTouchedNode = node;
      this.finished = true;
      return;
    }

    // outcome.kind === 'correct'
    await this.seedCorrectProbe(node);
    this.lastTouchedNode = node;
    this.index += 1;
    if (this.index >= this.ladderLength) {
      this.finished = true;
    }
  }

  async finish(): Promise<NodeId> {
    const entryNode = this.lastTouchedNode ?? this.config.floorNodeId;
    await settings.set('currentNodeId', entryNode);
    return entryNode;
  }

  async skipToFloor(): Promise<NodeId> {
    await settings.set('currentNodeId', this.config.floorNodeId);
    return this.config.floorNodeId;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Seed one correctly-answered probe's node through the sole structural
   * door (`upsertNonMilestoneProgress`), preserving every other `metrics` key
   * and never lowering a prior aggregate (via `buildPlacementSeed`).
   */
  private async seedCorrectProbe(node: NodeId): Promise<void> {
    const graphNode = this.nodesById.get(node);
    if (!graphNode) {
      // Programmer error, not a learner-facing condition: config/placement.ts's
      // ascentChain is asserted (in placement.test.ts, Phase 1) to reference
      // only live, generator-backed graph nodes.
      throw new Error(
        `[PlacementController] ascentChain node "${node}" is absent from the live graph — check config/placement.ts against loadGraph().`
      );
    }
    const nodeConfig = resolveMasteryConfig(graphNode);

    const existing = await getProgress(node);
    const { mastery, other } = parseMasteryMetrics(existing?.metrics ?? '');
    const seed = buildPlacementSeed(nodeConfig, this.config.seedCoordinate, mastery.aggregate);
    const metrics = serializeMasteryMetrics(other, seed);

    await upsertNonMilestoneProgress({ nodeId: node, metrics });
  }
}

// ---------------------------------------------------------------------------
// createPlacementController — factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh `PlacementController` for one onboarding run.
 *
 * @param config - Defaults to the shipped `PLACEMENT_CONFIG`. Injectable for
 *                 testing (e.g. a shorter ascent chain / probe count).
 */
export function createPlacementController(
  config: PlacementConfig = PLACEMENT_CONFIG
): PlacementController {
  return new PlacementControllerImpl(config);
}
