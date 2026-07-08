/**
 * self-check.ts — Pure staleness-weighted pick for the voluntary self-check
 * ("Перевір себе") button on the node map.
 *
 * USER-INITIATED RETRIEVAL PRACTICE, NOT SPACED REPETITION:
 *   The banded scheduler (stage 05) decides when a mastered node comes back
 *   automatically via `due_at`. This pick is the learner's own "surprise me
 *   with something I've already learned" — it never reads or writes `due_at`;
 *   the resulting session flows through the normal pipeline, which reschedules
 *   reviews on its own.
 *
 * WEIGHTED, NOT UNIFORM:
 *   Each mastered candidate is weighted by how long ago its progress row was
 *   last written (`now - progress.updatedAt` at assembly time). To the learner
 *   it still feels random; pedagogically it prefers the nodes closest to being
 *   forgotten instead of re-serving what was just practiced. `updatedAt` moves
 *   on ANY progress write (including scheduling), so staleness is "time since
 *   last progress write" — an accepted proxy, not a per-attempt timestamp.
 *
 * WEIGHT CLAMP:
 *   `weight = min(max(staleSinceMs, 1 minute), 30 days)`. The floor makes an
 *   all-equally-fresh set uniform (and absorbs negative values from clock
 *   skew); the cap stops one ancient node from monopolizing the draw.
 *
 * NEVER THROWS:
 *   Returns `null` for an empty candidate list — the caller hides the button
 *   before this can matter (anti-shame: no dead tap, no error surface).
 *
 * PURE:
 *   No DB, no clock, no I/O, no `Math.random` — the caller assembles
 *   candidates and supplies the `SeededRng`.
 */

import type { NodeId, SeededRng } from '@/core/types';

// ---------------------------------------------------------------------------
// SelfCheckCandidate
// ---------------------------------------------------------------------------

export interface SelfCheckCandidate {
  readonly nodeId: NodeId;
  /**
   * `now - progress.updatedAt` at assembly time. May be negative on clock
   * skew — clamped to the weight floor, never rejected.
   */
  readonly staleSinceMs: number;
}

// ---------------------------------------------------------------------------
// Weight clamp constants
// ---------------------------------------------------------------------------

/** Staleness weight ceiling — beyond 30 days every node is "equally forgotten". */
export const SELF_CHECK_STALENESS_CAP_MS = 30 * 24 * 60 * 60 * 1000;

/** Staleness weight floor — makes an all-fresh set uniform, absorbs clock skew. */
const SELF_CHECK_MIN_WEIGHT_MS = 60_000;

// ---------------------------------------------------------------------------
// pickSelfCheckNode — the pure weighted draw
// ---------------------------------------------------------------------------

/**
 * pickSelfCheckNode(candidates, rng): NodeId | null
 *
 * Draws one candidate with probability proportional to its clamped staleness.
 * Deterministic given the rng; never throws; `null` only for an empty list.
 */
export function pickSelfCheckNode(
  candidates: readonly SelfCheckCandidate[],
  rng: SeededRng
): NodeId | null {
  if (candidates.length === 0) {
    return null;
  }

  const weights = candidates.map((c) =>
    Math.min(Math.max(c.staleSinceMs, SELF_CHECK_MIN_WEIGHT_MS), SELF_CHECK_STALENESS_CAP_MS)
  );
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  const r = rng.next() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) {
      return candidates[i].nodeId;
    }
  }

  // Float edge (r === totalWeight is unreachable for rng.next() < 1, but the
  // cumulative sum can undershoot by an ulp) — the last candidate absorbs it.
  return candidates[candidates.length - 1].nodeId;
}
