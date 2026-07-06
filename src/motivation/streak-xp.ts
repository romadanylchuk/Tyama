/**
 * streak-xp.ts — Pure streak/XP derivation + thin consumer-safe emission
 * helpers (Stage 06, Phase 4).
 *
 * PURE CORE, IMPURE EDGE (DL-E of the feature plan):
 *   `computeStreakDisplay` and `nextXp` are pure, deterministic, unit-testable
 *   without a DB. The `record*`/`award*` functions below them are thin impure
 *   wrappers that persist the pure result via the SAME seams every other
 *   stage-01..05 non-milestone write already uses:
 *     - `upsertNonMilestoneProgress` (progress-repository.ts) — streak/xp are
 *       explicitly documented as non-milestone `ProgressRow` fields.
 *     - `appendFirehose` (events-repository.ts) — behavioral telemetry.
 *     - `recordMilestone` (milestone-gate.ts) — the SOLE milestone/durable-event
 *       writer, reused (not duplicated) for the pre-existing `'first_streak_reached'`
 *       `MilestoneKind`.
 *   NO NEW WRITER IS INTRODUCED. This module is a consumer that emits through
 *   existing gates, exactly as DL-E requires.
 *
 * GLOBAL SENTINEL ROW (an implementation-shape decision for this phase):
 *   Streak/XP are app-wide (a single learner's daily streak and total XP),
 *   not per-skill-node. `ProgressRow` is keyed by `NodeId` (one row per skill
 *   atom). Rather than inventing a new table/column (a DB-schema change out of
 *   scope for a UI-shell stage), this module stores the single global
 *   streak/XP state under a synthetic sentinel node id, `GLOBAL_MOTIVATION_NODE_ID`,
 *   mirroring the EXISTING sentinel convention the milestone gate already uses
 *   for non-node milestones (`__milestone_<kind>__`). This sentinel:
 *     - is never a member of `loadGraph().nodes`, so `useMastery`/the node map
 *       naturally never iterate or render it as a skill node;
 *     - never has `dueAt` set by this module, so it can never surface in the
 *       spaced-repetition due queue (Phase 5) even though it does not match
 *       `getDueNodes()`'s `__milestone_%` filter pattern.
 *
 * ANTI-SHAME INVARIANTS (asserted by `streak-xp.test.ts` and the Phase-7 guard):
 *   - A streak miss is a SILENT HOLD — the display never decreases, never
 *     resets to 0/1. Only a truly consecutive kept day increments it.
 *   - XP is strictly non-decreasing — `nextXp` never subtracts.
 */

import type { NodeId } from '@/core/types';
import { getProgress, upsertNonMilestoneProgress } from '@/repositories/progress-repository';
import { appendFirehose } from '@/repositories/events-repository';
import { recordMilestone } from '@/repositories/milestone-gate';
import { XP_AWARDS } from './motivation-config';

// ---------------------------------------------------------------------------
// GLOBAL_MOTIVATION_NODE_ID — the sentinel progress-row id
// ---------------------------------------------------------------------------

/**
 * Synthetic sentinel `NodeId` under which the single global streak/XP state
 * is persisted via `upsertNonMilestoneProgress`. NOT a real skill-graph node —
 * see the file header for why this convention was chosen.
 */
export const GLOBAL_MOTIVATION_NODE_ID: NodeId = '__global_motivation__';

// ---------------------------------------------------------------------------
// Motivation metrics sub-shape — a typed accessor over the opaque metrics blob
// ---------------------------------------------------------------------------

/**
 * The `motivation` sub-key of the sentinel row's `progress.metrics` JSON blob.
 * Mirrors the `parseMasteryMetrics`/`serializeMasteryMetrics` carry-through
 * pattern (`@/core/mastery/mastery-metrics`) at a much smaller scale: only
 * `lastSessionDay` needs to be remembered to compute the next streak value.
 */
interface MotivationMeta {
  /** UTC calendar-day key ('YYYY-MM-DD') of the last kept-day session, or null. */
  readonly lastSessionDay: string | null;
}

function parseMotivationMeta(metricsJson: string): {
  meta: MotivationMeta;
  other: Record<string, unknown>;
} {
  if (metricsJson === '') {
    return { meta: { lastSessionDay: null }, other: {} };
  }
  try {
    const parsed: unknown = JSON.parse(metricsJson);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { meta: { lastSessionDay: null }, other: {} };
    }
    const { motivation, ...other } = parsed as Record<string, unknown>;
    const lastSessionDay =
      typeof motivation === 'object' &&
      motivation !== null &&
      typeof (motivation as Record<string, unknown>).lastSessionDay === 'string'
        ? ((motivation as Record<string, unknown>).lastSessionDay as string)
        : null;
    return { meta: { lastSessionDay }, other };
  } catch {
    // Safe degradation — never throw on malformed metrics (anti-shame: a
    // corrupt blob must never block the app from rendering).
    return { meta: { lastSessionDay: null }, other: {} };
  }
}

function serializeMotivationMeta(other: Record<string, unknown>, meta: MotivationMeta): string {
  return JSON.stringify({ ...other, motivation: meta });
}

// ---------------------------------------------------------------------------
// Date helpers — UTC calendar-day keys (pure, no Intl, no locale dependence)
// ---------------------------------------------------------------------------

/** Format an epoch-ms timestamp as a UTC calendar-day key ('YYYY-MM-DD'). */
function toDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Whole-day difference between two 'YYYY-MM-DD' UTC calendar-day keys. */
function daysBetween(fromDay: string, toDay: string): number {
  const fromMs = Date.parse(`${fromDay}T00:00:00.000Z`);
  const toMs = Date.parse(`${toDay}T00:00:00.000Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

// ---------------------------------------------------------------------------
// computeStreakDisplay — pure streak derivation (anti-shame invariant, in data form)
// ---------------------------------------------------------------------------

export interface StreakConfig {
  /** Reserved for a future variant that also validates the day-kept bar here;
   *  today the caller (Phase 6 session controller) is responsible for only
   *  invoking this once `MIN_TASKS_FOR_KEPT_DAY` is met for `today`. Accepted
   *  now for forward-compatible signature parity with the feature plan. */
  readonly minTasksForKeptDay: number;
}

/**
 * computeStreakDisplay(currentStreak, lastSessionDay, today, config): number
 *
 * PURE. Never returns a value lower than `currentStreak` — a miss is a
 * SILENT HOLD, never a decrease or a reset to 0/1.
 *
 * - `lastSessionDay === today`            → hold (already counted today).
 * - `lastSessionDay === null`             → `currentStreak + 1` (first-ever kept day).
 * - exactly one day's gap (consecutive)   → `currentStreak + 1`.
 * - any other gap (a miss, or clock skew) → hold (silent pause, never a loss).
 */
export function computeStreakDisplay(
  currentStreak: number,
  lastSessionDay: string | null,
  today: string,
  config?: StreakConfig
): number {
  void config; // see StreakConfig doc — reserved, not yet consulted here.

  if (lastSessionDay === today) {
    return currentStreak;
  }
  if (lastSessionDay === null) {
    return currentStreak + 1;
  }
  const gap = daysBetween(lastSessionDay, today);
  if (gap === 1) {
    return currentStreak + 1;
  }
  // A miss (gap > 1) or a non-positive gap (clock skew / already-processed
  // out-of-order call): silent hold. NEVER a decrease.
  return currentStreak;
}

// ---------------------------------------------------------------------------
// nextXp — pure, strictly non-decreasing XP derivation
// ---------------------------------------------------------------------------

/**
 * nextXp(currentXp, award): number
 *
 * PURE. XP is strictly non-decreasing — a negative `award` is floored at 0
 * rather than ever subtracting (anti-shame: XP is never deducted).
 */
export function nextXp(currentXp: number, award: number): number {
  return currentXp + Math.max(0, award);
}

// ---------------------------------------------------------------------------
// recordKeptDaySession — thin emission wrapper (consumer, no new writer)
// ---------------------------------------------------------------------------

export interface KeptDaySessionResult {
  /** The (possibly unchanged) streak value after this call. */
  readonly streak: number;
  /** True only the very first time a kept day is ever recorded. */
  readonly isFirstKeptDay: boolean;
}

/**
 * recordKeptDaySession(nowMs?): Promise<KeptDaySessionResult>
 *
 * Call ONCE per session, after the caller (Phase 6 session controller) has
 * confirmed the session met `MIN_TASKS_FOR_KEPT_DAY`. Idempotent per calendar
 * day: calling it again the same UTC day is a silent no-op read (no duplicate
 * write, no duplicate firehose event).
 *
 * On the very first kept day ever recorded (`isFirstKeptDay`), fires the
 * pre-existing `'first_streak_reached'` milestone via `recordMilestone` — the
 * ONE sanctioned milestone-durable writer. No new durable-event writer is
 * introduced by this module.
 */
export async function recordKeptDaySession(
  nowMs: number = Date.now()
): Promise<KeptDaySessionResult> {
  const today = toDateKey(nowMs);
  const row = await getProgress(GLOBAL_MOTIVATION_NODE_ID);
  const currentStreak = row?.streak ?? 0;
  const { meta, other } = parseMotivationMeta(row?.metrics ?? '');

  const isFirstKeptDay = meta.lastSessionDay === null;
  const isNewDay = meta.lastSessionDay !== today;
  const streak = computeStreakDisplay(currentStreak, meta.lastSessionDay, today);

  if (isNewDay) {
    await upsertNonMilestoneProgress({
      nodeId: GLOBAL_MOTIVATION_NODE_ID,
      streak,
      metrics: serializeMotivationMeta(other, { lastSessionDay: today }),
    });
    await appendFirehose('streak_kept_day', { streak, day: today });

    if (isFirstKeptDay) {
      await recordMilestone({ kind: 'first_streak_reached', detail: { streak } });
    }
  }

  return { streak, isFirstKeptDay };
}

// ---------------------------------------------------------------------------
// awardXp — thin emission wrapper (consumer, no new writer)
// ---------------------------------------------------------------------------

/**
 * awardXp(amount): Promise<number>
 *
 * Persists `nextXp(currentXp, amount)` via `upsertNonMilestoneProgress` and
 * appends a `'xp_awarded'` firehose event. Returns the new total.
 */
export async function awardXp(amount: number): Promise<number> {
  const row = await getProgress(GLOBAL_MOTIVATION_NODE_ID);
  const currentXp = row?.xp ?? 0;
  const xp = nextXp(currentXp, amount);

  await upsertNonMilestoneProgress({ nodeId: GLOBAL_MOTIVATION_NODE_ID, xp });
  await appendFirehose('xp_awarded', { amount, xp });

  return xp;
}

/** Award the config-as-data task-completion XP amount. */
export async function awardTaskCompletionXp(): Promise<number> {
  return awardXp(XP_AWARDS.taskCompletion);
}

/** Award the config-as-data mastery-milestone XP amount. */
export async function awardMasteryMilestoneXp(): Promise<number> {
  return awardXp(XP_AWARDS.masteryMilestone);
}
