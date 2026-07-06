/**
 * anti-shame-tokens.ts — the error-feedback VISUAL spec, derived from the
 * single anti-shame invariant (Stage 06, Phase 2).
 *
 * WHY THIS FILE EXISTS (not "a fresh philosophy" — a derivation):
 *   The repo-wide invariant is: no UI state ever shows something subtracted;
 *   an error is a routing signal, never a loss event. Every token below is
 *   derivable from that one sentence:
 *
 *     - No red, no ✗, no buzzer, no shake, no padlock, no penalty glyph —
 *       none of these exist as tokens here, by construction (there is no
 *       "danger"/"error" color family in this module at all).
 *     - Feedback is a CALM accent (from the same muted-teal/blue family as
 *       the rest of the UI, not a special "warning" hue) + FORWARD MOTION
 *       (a transition that carries the eye toward the next step, never a
 *       static/blocking "you failed" card).
 *     - TIMING is part of the spec: a brief pause (`timingBeatMs`) always
 *       precedes the transition. A same-millisecond flash reads as a buzzer
 *       even without color — the beat is what makes it feel considered
 *       rather than punitive.
 *
 * FORBIDDEN_FEEDBACK_VOCAB:
 *   A config-as-data word list the Phase-7 structural guard test greps the
 *   whole stage-06 UI source tree against (rendered/UI string literals and
 *   JSX text, not code identifiers). Defined here — next to the tokens it
 *   protects — so the two can never drift apart. Comments that NEGATE a
 *   forbidden word (e.g. "never locked") are an intentional, documented
 *   exemption at the Phase-7 guard, not handled by this module.
 *
 * SCOPE:
 *   This module holds ONLY the error-feedback visual spec. General theme
 *   tokens (persona color/type/space/motion) live in `tokens.ts`. No string
 *   copies live here — copy is a `LocalizedRef` resolved via `src/i18n`
 *   (see `error.*` keys in the locale catalogs).
 */

// ---------------------------------------------------------------------------
// AntiShameFeedbackTokens — the calm "not yet" visual + timing spec
// ---------------------------------------------------------------------------

export interface AntiShameFeedbackTokens {
  /**
   * The calm accent color used for a "not yet — try it this way" surface.
   * Drawn from the same muted accent family as ordinary UI chrome — there is
   * deliberately no separate "error red" hue for this state to borrow from.
   */
  calmAccent: string;
  /**
   * A slightly softer background wash for the calm-feedback panel/banner.
   * Never the persona's `accentMuted` used for "not-yet-open" — kept
   * distinct so the two calm-but-different states remain visually legible.
   */
  calmSurface: string;
  /**
   * Milliseconds the calm transition (fade/slide toward the next step)
   * takes to complete, once it starts.
   */
  transitionMs: number;
  /**
   * Minimum pause, in milliseconds, BEFORE the calm transition begins.
   * MUST be > 0: a same-millisecond flash reads as a buzzer regardless of
   * color. This is the "timing is part of the spec" requirement from the
   * brief — asserted by `anti-shame-tokens.test.ts`.
   */
  timingBeatMs: number;
}

/**
 * Light-scheme calm-feedback tokens. Scheme-orthogonal to persona — every
 * persona's feedback surface uses one of these two (light/dark), never a
 * persona-specific "error" palette.
 */
export const ANTI_SHAME_FEEDBACK_LIGHT: AntiShameFeedbackTokens = Object.freeze({
  calmAccent: '#3E7CB1',
  calmSurface: '#EAF2F8',
  transitionMs: 260,
  timingBeatMs: 350,
});

/** Dark-scheme calm-feedback tokens — same hue family, dark-adjusted. */
export const ANTI_SHAME_FEEDBACK_DARK: AntiShameFeedbackTokens = Object.freeze({
  calmAccent: '#6FA3D6',
  calmSurface: '#1B2833',
  transitionMs: 260,
  timingBeatMs: 350,
});

/**
 * Resolve the calm-feedback token set for the active color scheme.
 * Thin helper so `ThemeProvider`/components never need to branch on scheme
 * for this concern individually.
 */
export function resolveAntiShameFeedback(scheme: 'light' | 'dark'): AntiShameFeedbackTokens {
  return scheme === 'dark' ? ANTI_SHAME_FEEDBACK_DARK : ANTI_SHAME_FEEDBACK_LIGHT;
}

// ---------------------------------------------------------------------------
// FORBIDDEN_FEEDBACK_VOCAB — the structural-guard word list (config-as-data)
// ---------------------------------------------------------------------------

/**
 * Words/glyphs that must NEVER appear as rendered UI copy or a UI-facing
 * token value anywhere in the stage-06 source tree (`src/i18n`, `src/theme`,
 * `src/explanation`, `src/motivation`, `src/navigation`, `src/ui`).
 *
 * Consumed by the Phase-7 structural guard
 * (`src/__tests__/anti-shame-guard.test.ts`), and by this module's own
 * `anti-shame-tokens.test.ts` to assert no token value here contains one.
 *
 * Kept intentionally narrow to the exact vocabulary named by the invariant
 * (brief §"anti-shame" / CLAUDE.md) — broader stems (e.g. "fail") are
 * deliberately excluded because they collide with legitimate type/field
 * names (`FailedStep`, `failedStep`) that are not rendered UI copy.
 */
export const FORBIDDEN_FEEDBACK_VOCAB: readonly string[] = Object.freeze([
  'wrong',
  'red',
  '✗',
  'buzzer',
  'shake',
  'locked',
  'padlock',
  'penalty',
  'subtract',
  'deducted',
]);

/**
 * Case-insensitive substring check used by guard tests: does `value`
 * contain any forbidden vocabulary word?
 */
export function containsForbiddenVocab(value: string): boolean {
  const lower = value.toLowerCase();
  return FORBIDDEN_FEEDBACK_VOCAB.some((word) => lower.includes(word.toLowerCase()));
}

/**
 * A conservative "pure red" hex sentinel pattern (e.g. `#f00`, `#ff0000`,
 * `#ffcccc`-style near-red) used to catch a red accent slipping into a
 * theme/feedback token by pattern rather than by name. Deliberately simple —
 * it flags hex values whose red channel dominates green/blue heavily, which
 * covers the "alarm red" family without false-positives on muted/desaturated
 * accents used elsewhere in this file and in `tokens.ts`.
 */
export function isDominantRedHex(hex: string): boolean {
  const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(hex.trim());
  if (!match) {
    return false;
  }
  let hexBody = match[1];
  if (hexBody.length === 3) {
    hexBody = hexBody
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(hexBody.slice(0, 2), 16);
  const g = parseInt(hexBody.slice(2, 4), 16);
  const b = parseInt(hexBody.slice(4, 6), 16);
  // "Dominant red" heuristic: red channel is high AND clearly the largest
  // channel by a wide margin (rules out warm neutrals/oranges/browns that
  // happen to have a higher red channel but are not alarm-red).
  return r >= 180 && r - Math.max(g, b) >= 90;
}
