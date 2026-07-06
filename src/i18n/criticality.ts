/**
 * criticality.ts — No-shame-critical key taxonomy for the completeness gate.
 *
 * Config-as-data: the completeness checker (src/i18n/completeness.ts) uses
 * this module to determine which keys MUST supply all register variants in
 * every shipped locale. A missing critical variant is a BUILD ERROR.
 *
 * Ordinary keys may silently fall back to `_neutral` or the bare key — the
 * completeness gate skips them. Only no-shame-critical strings are enforced.
 *
 * WHY CONFIG-AS-DATA:
 *   The set of critical key prefixes is a pedagogical/UX policy, not code
 *   logic. Calibrating which strings are "no-shame-critical" should be a data
 *   change (here), not a code change in the checker.
 *
 * ANTI-SHAME INVARIANT:
 *   No-shame-critical strings are EXACTLY those whose absence or wrong-register
 *   rendering could expose a shaming surface. Any string that appears in
 *   error-feedback, format hints, streak-miss, lapse, or routing-frame copy
 *   must have all register variants present to guarantee the warm-register path
 *   is never silently dropped.
 */

// ---------------------------------------------------------------------------
// Criticality type
// ---------------------------------------------------------------------------

/**
 * Criticality level for an i18n catalog key.
 *
 *   'no-shame-critical' — ALL register variants MUST be present in EVERY locale.
 *                         Missing a variant is a build error.
 *   'ordinary'          — Register variants are optional; silent neutral fallback allowed.
 */
export type Criticality = 'no-shame-critical' | 'ordinary';

// ---------------------------------------------------------------------------
// CRITICAL_KEY_PREFIXES — config-as-data list of critical key namespaces
// ---------------------------------------------------------------------------

/**
 * Key prefixes that make a catalog key no-shame-critical.
 *
 * A key is no-shame-critical if its prefix matches ANY entry in this list
 * (checked via `key.startsWith(prefix)`).
 *
 * Prefixes covered:
 *   'error.'      — Error-feedback and "not yet" surfaces.
 *   'hint.'       — Step-level format hints and guidance.
 *   'parse.'      — ParseError kind format-hint copy (e.g. 'parse.empty').
 *   'lapse.'      — Lapse/regression framing for the learner.
 *   'descent.'    — Staged-descent routing framing ("let's firm up X first").
 *   'escalation.' — Anti-loop escalation copy ("I've copied a prompt...").
 *   'streak.'     — Streak display (streak earned/maintained; miss is silent
 *                   but the maintained copy must be warm and never shame).
 *   'feedback.'   — Generic task-feedback surfaces (not-yet, try-this-way).
 *   'ring.'       — Ring-state labels (available/in-progress/mastered copy).
 *   'clipboard.'  — Clipboard explanation affordance copy.
 *   'onboarding.' — Stage-07 first-run framing (welcome/placement/done copy).
 *                   The onboarding flow is a learner's FIRST impression of the
 *                   app's tone — welcome, placement staged-descent framing,
 *                   and completion copy are exactly the kind of no-shame
 *                   surface this taxonomy exists to protect. Ordinary
 *                   onboarding chrome (button labels like "Begin"/"Skip",
 *                   picker option labels) is deliberately kept OUT of this
 *                   namespace and lives under the existing `common.*`
 *                   ordinary namespace instead, so it is not forced to carry
 *                   register variants it doesn't need.
 */
export const CRITICAL_KEY_PREFIXES: readonly string[] = [
  'error.',
  'hint.',
  'parse.',
  'lapse.',
  'descent.',
  'escalation.',
  'streak.',
  'feedback.',
  'ring.',
  'clipboard.',
  'onboarding.',
] as const;

// ---------------------------------------------------------------------------
// keyCriticality — classify a key against the config
// ---------------------------------------------------------------------------

/**
 * Returns the criticality level for a given i18n key.
 *
 * @param key — The bare key (without register suffix, e.g. 'error.notYet').
 * @returns 'no-shame-critical' if any prefix in CRITICAL_KEY_PREFIXES matches;
 *          'ordinary' otherwise.
 *
 * PURE: no side effects, no I/O, deterministic.
 */
export function keyCriticality(key: string): Criticality {
  for (const prefix of CRITICAL_KEY_PREFIXES) {
    if (key.startsWith(prefix)) {
      return 'no-shame-critical';
    }
  }
  return 'ordinary';
}
