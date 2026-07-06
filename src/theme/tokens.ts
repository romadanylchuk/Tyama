/**
 * tokens.ts — Persona/theme token contracts for Tyama (Stage 06, Phase 2).
 *
 * PERSONA = ENUM SELECTING A COHERENT BUNDLE (locked decision #12 / brief §4):
 *   `Persona` is a closed union. `PERSONA_BUNDLES` maps each persona to a
 *   `PersonaBundle` — a `{ register, light, dark }` triple. `register` is the
 *   i18next `context` value this persona's copy resolves under (see
 *   `src/i18n`); `light`/`dark` are complete `ThemeTokens` sets for the
 *   ORTHOGONAL dark/light axis (read from RN `useColorScheme()`, never from
 *   persona). A persona never implies a color scheme and vice versa.
 *
 * HOLDS NO STRING COPIES:
 *   Tokens are colors/sizes/spacing/motion constants only. All human-readable
 *   text remains a `LocalizedRef` resolved by `src/i18n` — this module must
 *   never gain a literal UI string.
 *
 * CONFIG-AS-DATA:
 *   `PERSONA_BUNDLES` is a frozen data map, MVP-tuned for the `adult-16+`
 *   persona (the primary anxious-adult target). `kid`/`enthusiast` bundles
 *   are working defaults, not yet calibrated — `pedagogy-pass` may retune
 *   the values without any code change.
 *
 * ANTI-SHAME NOTE:
 *   No bundle here may use red as an accent/feedback color. Error-feedback
 *   colors live in `anti-shame-tokens.ts`, derived independently of persona.
 */

import type { Register } from '@/i18n/catalog-types';

// ---------------------------------------------------------------------------
// Persona — the enum axis (orthogonal to dark/light)
// ---------------------------------------------------------------------------

/**
 * Closed union of persona bundles.
 *
 *   'adult-16+'  — the MVP primary persona: calm, low-stimulation, warm
 *                  register. What `settings.persona === 'default'` resolves to.
 *   'kid'        — brighter, more playful token set (working default; not the
 *                  MVP's shipped-onboarding choice, but a valid selectable bundle).
 *   'enthusiast' — a denser, more information-forward bundle for a learner who
 *                  wants less hand-holding chrome. Still anti-shame — the
 *                  register/feedback spec is a repo-wide invariant, not a
 *                  per-persona opt-out.
 */
export type Persona = 'adult-16+' | 'kid' | 'enthusiast';

/** All persona values — used for completeness assertions in tests. */
export const PERSONAS: readonly Persona[] = ['adult-16+', 'kid', 'enthusiast'] as const;

// ---------------------------------------------------------------------------
// ThemeTokens — color / type / space / motion token bundle
// ---------------------------------------------------------------------------

export interface ColorTokens {
  /** Screen background. */
  background: string;
  /** Card/surface background, one step up from `background`. */
  surface: string;
  /** Primary body text color. */
  textPrimary: string;
  /** Secondary/muted text color (captions, hints). */
  textSecondary: string;
  /** Persona accent — buttons, active states, primary emphasis. */
  accent: string;
  /** Muted variant of `accent` — used for `not-yet-open` ring/tile states. */
  accentMuted: string;
  /** Mastery-ring fill color (gained progress — never a "loss" color). */
  progress: string;
  /** Border/divider color. */
  border: string;
}

export interface TypeTokens {
  /** Small/caption text size (px). */
  sizeSmall: number;
  /** Body text size (px). */
  sizeBody: number;
  /** Heading text size (px). */
  sizeHeading: number;
  /** Regular font weight (RN accepts string weights). */
  weightRegular: '400' | '500';
  /** Bold/emphasis font weight. */
  weightBold: '600' | '700';
}

export interface SpaceTokens {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface MotionTokens {
  /** Fast, non-feedback transitions (e.g. tap highlight). */
  transitionFastMs: number;
  /** Standard transition duration for screen/panel changes. */
  transitionStandardMs: number;
}

/**
 * The full token bundle a screen/component reads via `useTheme().tokens`.
 * A persona × scheme combination always resolves to one complete
 * `ThemeTokens` — no partial/optional fields, so components never need
 * defensive fallbacks.
 */
export interface ThemeTokens {
  color: ColorTokens;
  type: TypeTokens;
  space: SpaceTokens;
  motion: MotionTokens;
}

// ---------------------------------------------------------------------------
// PersonaBundle — register + light/dark token pair
// ---------------------------------------------------------------------------

export interface PersonaBundle {
  /** The i18next register this persona's copy resolves under. */
  register: Register;
  light: ThemeTokens;
  dark: ThemeTokens;
}

// ---------------------------------------------------------------------------
// Shared type/space/motion scales (identical across personas in the MVP;
// only color + register vary per persona today — kept as separate constants
// so a future persona can override type/space/motion independently).
// ---------------------------------------------------------------------------

const BASE_TYPE: TypeTokens = {
  sizeSmall: 13,
  sizeBody: 16,
  sizeHeading: 22,
  weightRegular: '400',
  weightBold: '600',
};

const BASE_SPACE: SpaceTokens = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const BASE_MOTION: MotionTokens = {
  transitionFastMs: 120,
  transitionStandardMs: 240,
};

// ---------------------------------------------------------------------------
// PERSONA_BUNDLES — config-as-data, frozen
// ---------------------------------------------------------------------------

/**
 * `adult-16+` — MVP primary persona. Calm, low-stimulation, warm register.
 * No red anywhere; muted teal/blue accent family.
 */
const ADULT_LIGHT: ThemeTokens = {
  color: {
    background: '#FAFAF8',
    surface: '#FFFFFF',
    textPrimary: '#2A2E33',
    textSecondary: '#6B7280',
    accent: '#2F7A6B',
    accentMuted: '#B9D6CF',
    progress: '#3E8E7E',
    border: '#E4E4E1',
  },
  type: BASE_TYPE,
  space: BASE_SPACE,
  motion: BASE_MOTION,
};

const ADULT_DARK: ThemeTokens = {
  color: {
    background: '#15181B',
    surface: '#1E2226',
    textPrimary: '#EDEFF1',
    textSecondary: '#9AA3AC',
    accent: '#4FA593',
    accentMuted: '#2A423C',
    progress: '#5CB4A0',
    border: '#2C3237',
  },
  type: BASE_TYPE,
  space: BASE_SPACE,
  motion: BASE_MOTION,
};

/**
 * `kid` — brighter, more playful palette. Still anti-shame; no red.
 */
const KID_LIGHT: ThemeTokens = {
  color: {
    background: '#FFFDF5',
    surface: '#FFFFFF',
    textPrimary: '#33302A',
    textSecondary: '#7A7466',
    accent: '#F5A623',
    accentMuted: '#F9DDA8',
    progress: '#4FB477',
    border: '#F0E9D8',
  },
  type: { ...BASE_TYPE, sizeBody: 18, sizeHeading: 24 },
  space: BASE_SPACE,
  motion: { transitionFastMs: 140, transitionStandardMs: 280 },
};

const KID_DARK: ThemeTokens = {
  color: {
    background: '#1B1710',
    surface: '#241F16',
    textPrimary: '#F5EFE2',
    textSecondary: '#B8AF9B',
    accent: '#F2B24C',
    accentMuted: '#4A3B1F',
    progress: '#5FC489',
    border: '#332C1E',
  },
  type: { ...BASE_TYPE, sizeBody: 18, sizeHeading: 24 },
  space: BASE_SPACE,
  motion: { transitionFastMs: 140, transitionStandardMs: 280 },
};

/**
 * `enthusiast` — denser, information-forward palette. Still no red, still
 * the same anti-shame feedback spec — only chrome density/tone differs.
 */
const ENTHUSIAST_LIGHT: ThemeTokens = {
  color: {
    background: '#F5F6F8',
    surface: '#FFFFFF',
    textPrimary: '#1C2024',
    textSecondary: '#5B6470',
    accent: '#3A5AE0',
    accentMuted: '#C4CFF7',
    progress: '#3D6BE0',
    border: '#DDE1E7',
  },
  type: { ...BASE_TYPE, sizeBody: 15, sizeSmall: 12 },
  space: { ...BASE_SPACE, md: 12, lg: 20 },
  motion: { transitionFastMs: 100, transitionStandardMs: 200 },
};

const ENTHUSIAST_DARK: ThemeTokens = {
  color: {
    background: '#101215',
    surface: '#191C20',
    textPrimary: '#E7E9EC',
    textSecondary: '#8B93A0',
    accent: '#5D7BF2',
    accentMuted: '#2A3560',
    progress: '#6E8AF5',
    border: '#252A30',
  },
  type: { ...BASE_TYPE, sizeBody: 15, sizeSmall: 12 },
  space: { ...BASE_SPACE, md: 12, lg: 20 },
  motion: { transitionFastMs: 100, transitionStandardMs: 200 },
};

/**
 * Frozen persona → bundle map. Every `Persona` has a complete entry;
 * `tokens.test.ts` asserts completeness so no persona can ever resolve to
 * `undefined` tokens.
 */
export const PERSONA_BUNDLES: Readonly<Record<Persona, PersonaBundle>> = Object.freeze({
  'adult-16+': Object.freeze({ register: 'warm', light: ADULT_LIGHT, dark: ADULT_DARK }),
  kid: Object.freeze({ register: 'warm', light: KID_LIGHT, dark: KID_DARK }),
  enthusiast: Object.freeze({ register: 'neutral', light: ENTHUSIAST_LIGHT, dark: ENTHUSIAST_DARK }),
});

// ---------------------------------------------------------------------------
// resolvePersona — safe degradation from the raw settings string
// ---------------------------------------------------------------------------

/**
 * Resolve a raw `settings.get('persona')` string to a known `Persona`.
 *
 * - `'default'` (the schema default — see `SETTINGS_DEFAULTS`) aliases to
 *   `'adult-16+'`, the MVP primary persona.
 * - Any other recognized persona value passes through unchanged.
 * - Any unrecognized/malformed value (e.g. a stale value from a removed
 *   persona, or corrupted storage) safely degrades to `'adult-16+'` —
 *   NEVER throws (anti-shame: a theme resolution failure must never block
 *   the app from rendering).
 */
export function resolvePersona(raw: string): Persona {
  if (raw === 'default') {
    return 'adult-16+';
  }
  if ((PERSONAS as readonly string[]).includes(raw)) {
    return raw as Persona;
  }
  return 'adult-16+';
}
