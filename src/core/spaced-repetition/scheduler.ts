/**
 * scheduler.ts — Pure banded spaced-repetition scheduler (Seam A).
 *
 * This module is the PURE scheduling function. It has no side effects:
 * no DB access, no clock reads, no storage. Same inputs always produce the
 * same output (deterministic). `nowMs` is injected so the function is
 * trivially testable without wall-clock stubbing.
 *
 * PURITY GUARANTEE (mirrors route.ts and the mastery engine):
 *   `scheduleReview()` imports NOTHING from '@/db', '@/repositories', or
 *   any I/O module. Its only external dependency is the `SpacedRepetitionConfig`
 *   parameter — a plain frozen data object.
 *
 * DISPOSITION RULES (speed-aware, keyed to stage-04 `speedFactor`):
 *   - DEMOTE:  !correct                → one band down, clamped at 0, lapses++.
 *   - PROMOTE: correct AND fast        → one band up, clamped at top.
 *   - HOLD:    correct AND slow        → same band, new dueAt.
 *   "Fast" is defined as: elapsedMs <= targetMs (the speedFactor ceiling).
 *   This is identical to the stage-04 cut `speedFactor >= SPEED_FACTOR_MAX`
 *   — a shared speed authority, no second notion of speed introduced.
 *   Note: elapsedMs <= 0 is treated as fast (guard against negative timing).
 *
 * ANTI-SHAME INVARIANTS (structural, not runtime checks):
 *   - Demote is ONE band, clamped at 0. Never negative, never reset to 0 directly
 *     (even at band 1 → band 0, not "reset"; at band 0 → stays 0, not "punished").
 *   - `lapses` is telemetry-only. It NEVER feeds the disposition or band math.
 *     A very high `lapses` value does not change the outcome — correct+fast always
 *     promotes regardless of past lapses.
 *   - The returned `ScheduledFields` carries only a new `dueAt` + band index +
 *     lapses counter. No "loss", "wrong", "penalty", or "reset" field exists.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 */

import type { SpacedRepetitionConfig } from '@/config/spaced-repetition';

// ---------------------------------------------------------------------------
// ReviewOutcome — the raw speed-aware outcome shape
// ---------------------------------------------------------------------------

/**
 * The raw outcome of a review attempt. Speed is carried as raw timing — NOT
 * a pre-quantized verdict. The scheduler derives disposition internally.
 *
 * RAW SHAPE (per D4 in the interview brief):
 *   Do not pre-compute speedFactor or a promote/hold/demote label before this
 *   interface — the scheduler is the single site that applies the speed cut.
 */
export interface ReviewOutcome {
  /** Whether the learner answered correctly. */
  readonly correct: boolean;
  /**
   * Wall-clock milliseconds the learner took to answer this review.
   * The scheduler uses this with `targetMs` to classify fast vs. slow.
   */
  readonly elapsedMs: number;
  /**
   * Per-node target response time in milliseconds.
   * Sourced from the stage-04 mastery config (`resolveMasteryConfig(node).targetMs`).
   * Passed through so the scheduler never reads config twice.
   */
  readonly targetMs: number;
}

// ---------------------------------------------------------------------------
// ReviewDisposition — internal classifier (not exported; single-use)
// ---------------------------------------------------------------------------

/** Internal disposition derived from a `ReviewOutcome`. */
type ReviewDisposition = 'promote' | 'hold' | 'demote';

// ---------------------------------------------------------------------------
// ScheduledFields — the output shape written to persistence
// ---------------------------------------------------------------------------

/**
 * The fields produced by `scheduleReview()` and written to the persistence layer.
 *
 * `dueAt` and `intervalBandIndex` are the actionable outputs:
 *   - `dueAt` is written to the `due_at` DB column (the partial-indexed queue).
 *   - `intervalBandIndex` is written to `metrics.spacedRepetition.intervalBandIndex`.
 *
 * `lapses` is telemetry-only: persisted so analysts can observe how many
 * lapses occurred, but NEVER read by scheduling or routing logic. It is part
 * of `metrics.spacedRepetition` alongside `intervalBandIndex`.
 */
export interface ScheduledFields {
  /** Epoch ms when this node is next due for review. `nowMs + intervalsMs[band]`. */
  readonly dueAt: number;
  /**
   * The new band index (0-indexed into `SpacedRepetitionConfig.intervalsMs`).
   * Clamped at both ends: [0, intervalsMs.length - 1].
   */
  readonly intervalBandIndex: number;
  /**
   * Cumulative lapse count (telemetry only).
   * Incremented by 1 on each demote. NEVER read by band math or disposition logic.
   */
  readonly lapses: number;
}

// ---------------------------------------------------------------------------
// SchedulerConfig — runtime config alias (forwarded for callers)
// ---------------------------------------------------------------------------

/**
 * Alias used by the scheduler. Callers may pass a `SpacedRepetitionConfig`
 * directly — the scheduler reads `config.intervalsMs`.
 */
export type SchedulerConfig = SpacedRepetitionConfig;

// ---------------------------------------------------------------------------
// Internal: deriveDisposition
// ---------------------------------------------------------------------------

/**
 * Classify a `ReviewOutcome` into a `ReviewDisposition`.
 *
 * Speed cut: `elapsedMs <= targetMs` is the "fast" threshold — exactly the
 * condition where `speedFactor` (stage-04 authority) reaches its ceiling of 1.0.
 * The scheduler reuses this cut so there is one speed authority, not two.
 *
 * Edge: `elapsedMs <= 0` is treated as fast (guard against negative/zero timing;
 * avoid float-fuzz issues with very short answer times).
 */
function deriveDisposition(outcome: ReviewOutcome): ReviewDisposition {
  if (!outcome.correct) {
    return 'demote';
  }
  // Fast = elapsed <= target (the speedFactor ceiling cut).
  // Also treat elapsed <= 0 as fast (defensive: negative timing → fast).
  const fast = outcome.elapsedMs <= 0 || outcome.elapsedMs <= outcome.targetMs;
  return fast ? 'promote' : 'hold';
}

// ---------------------------------------------------------------------------
// scheduleReview — the public pure scheduling function
// ---------------------------------------------------------------------------

/**
 * scheduleReview(current, outcome, nowMs, config): ScheduledFields
 *
 * Pure banded spaced-repetition scheduling function. Given the current band
 * state, a review outcome, the current wall-clock time (injected), and the
 * band config, returns the new `ScheduledFields`.
 *
 * PURE — no side effects, no DB access, no clock read. `nowMs` MUST be
 * injected by the caller (use `Date.now()` at the call site, never here).
 * Same `(current, outcome, nowMs, config)` → same output on every call.
 *
 * BAND TRANSITION:
 *   - promote: newBand = min(current.intervalBandIndex + 1, top)
 *   - hold:    newBand = current.intervalBandIndex
 *   - demote:  newBand = max(current.intervalBandIndex - 1, 0)
 *   where `top = config.intervalsMs.length - 1`.
 *
 * DUE AT: `nowMs + config.intervalsMs[newBand]`.
 *
 * LAPSES: accumulated count, incremented only on demote, never read by band math.
 *
 * @param current - Current scheduler state (band index + lapse count).
 * @param outcome - Raw review outcome (correct + elapsed + target timing).
 * @param nowMs   - Current epoch ms (injected — never call Date.now() here).
 * @param config  - Band ladder config (use `resolveSpacedRepetitionConfig()`).
 * @returns       - New `ScheduledFields` to persist.
 */
export function scheduleReview(
  current: ScheduledFields,
  outcome: ReviewOutcome,
  nowMs: number,
  config: SchedulerConfig
): ScheduledFields {
  const top = config.intervalsMs.length - 1;
  const disposition = deriveDisposition(outcome);

  let newBand: number;
  let newLapses: number;

  switch (disposition) {
    case 'promote':
      // Advance one band; clamp at the top band (anti-shame: never overshoot).
      newBand = Math.min(current.intervalBandIndex + 1, top);
      newLapses = current.lapses;
      break;
    case 'hold':
      // Stay on the same band; re-schedule at the current interval.
      newBand = current.intervalBandIndex;
      newLapses = current.lapses;
      break;
    case 'demote':
      // Drop one band; clamp at 0 (anti-shame: never negative, never reset).
      // A single lapse after a long interval shifts only ONE band — not a full reset.
      newBand = Math.max(current.intervalBandIndex - 1, 0);
      // lapses is telemetry-only: records the lapse, never feeds band math.
      newLapses = current.lapses + 1;
      break;
  }

  const dueAt = nowMs + config.intervalsMs[newBand];

  return {
    dueAt,
    intervalBandIndex: newBand,
    lapses: newLapses,
  };
}
