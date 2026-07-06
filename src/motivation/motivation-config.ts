/**
 * motivation-config.ts — Config-as-data shipped defaults for the motivation
 * layer (Stage 06, Phase 4).
 *
 * CONFIG-AS-DATA INVARIANT:
 *   These are the working defaults the binary ships with. `pedagogy-pass`
 *   calibrates the exact numbers later as a pure data change — no code change
 *   required. Never hardcode these values at a call site; always import them
 *   (or a resolved variant) from here.
 *
 * WHY THESE THREE VALUES LIVE TOGETHER:
 *   All three are "how generous is the motivation layer" knobs, owned by this
 *   stage per the brief (§"Motivation primitives") and the feature-plan
 *   (Phase 4 step 1). `DUE_REVIEW_SESSION_CAP` is consumed by Phase 5's
 *   `where-to-next` merge, not by this phase directly — it is defined here
 *   because it is a motivation/gamification policy value, not a
 *   spaced-repetition scheduling value (that lives in `@/config/spaced-repetition`).
 */

// ---------------------------------------------------------------------------
// MIN_TASKS_FOR_KEPT_DAY — the streak "kept day" bar
// ---------------------------------------------------------------------------

/**
 * The number of completed tasks in a session that counts a calendar day as
 * "kept" for streak purposes. A LOW ACHIEVABLE BAR, not a quota — the brief
 * is explicit that this must never become a demanding target.
 *
 * The caller (Phase 6 session controller) is responsible for tracking the
 * per-session completed-task count and only invoking the streak-emission
 * helpers (`recordKeptDaySession`) once this bar is met.
 */
export const MIN_TASKS_FOR_KEPT_DAY = 1;

// ---------------------------------------------------------------------------
// XP_AWARDS — task-completion and mastery-milestone award amounts
// ---------------------------------------------------------------------------

export interface XpAwards {
  /** XP granted for each completed task (a 'correct' outcome). */
  readonly taskCompletion: number;
  /** XP granted when a node crosses its mastery gate (first_node_mastered). */
  readonly masteryMilestone: number;
}

/**
 * Shipped XP award defaults. XP is a secondary, purely additive signal —
 * never deducted, never a basis for comparison (leaderboards are off by
 * default). `pedagogy-pass` may retune these amounts without a code change.
 */
export const XP_AWARDS: XpAwards = Object.freeze({
  taskCompletion: 10,
  masteryMilestone: 50,
});

// ---------------------------------------------------------------------------
// DUE_REVIEW_SESSION_CAP — Phase 5's "where to next" repetition cap
// ---------------------------------------------------------------------------

/**
 * The maximum number of due spaced-repetition reviews that may dominate the
 * "where to next" merge in a single session (Phase 5:
 * `diagnosticDebt ?? cappedDueReviews ?? curatedEntryPath`). Bounds repetition
 * so it can never crowd out forward movement through the curated path.
 *
 * Shipped as a working default (brief suggests 3–5); `pedagogy-pass` may
 * calibrate this later as a pure data change.
 */
export const DUE_REVIEW_SESSION_CAP = 4;
