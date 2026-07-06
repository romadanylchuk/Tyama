/**
 * catalog-types.ts — i18n catalog shape contracts for Tyama.
 *
 * Register axis:
 *   i18next resolves register as a native `context` suffix:
 *     t('error.notYet', { context: 'warm' })  → 'error.notYet_warm'
 *     t('error.notYet', { context: 'neutral' }) → 'error.notYet_neutral'
 *   `_neutral` is the fallback for any key missing a register variant.
 *
 * No-shame-critical strings MUST supply both `_warm` and `_neutral` variants
 * in every shipped locale. Ordinary strings may omit register variants and
 * silently fall back to `_neutral` or the bare key. The completeness gate
 * (src/i18n/completeness.ts) enforces this as a build error.
 *
 * LANGUAGE-NEUTRAL CORE INVARIANT:
 *   The domain core never writes localized strings — it emits `LocalizedRef`
 *   values. This module resolves them; no localized string ever lives in core.
 */

// ---------------------------------------------------------------------------
// Register — formality/criticality axis for string selection
// ---------------------------------------------------------------------------

/**
 * Closed union of string register variants.
 *
 *   'warm'    — encouraging, personal, no-pressure tone. Used for error-feedback,
 *               hints, streak-miss copy, and staged-descent framing. The default
 *               for the 'adult-16+' persona (anti-shame north star).
 *   'neutral' — plain, factual. Universal fallback for any key missing a 'warm'
 *               variant, and the register for purely informational strings that
 *               carry no emotional weight.
 *
 * Extend this union if future personas need an additional axis (e.g. 'playful'
 * for 'kid') — add the new variant and update REGISTERS below.
 */
export type Register = 'warm' | 'neutral';

/** All register values — used by the completeness checker. */
export const REGISTERS: readonly Register[] = ['warm', 'neutral'] as const;

/** The register value used as i18next fallback when a variant is absent. */
export const REGISTER_FALLBACK: Register = 'neutral';

// ---------------------------------------------------------------------------
// LocaleTag — the supported UI/content locale identifiers
// ---------------------------------------------------------------------------

/**
 * Closed union of supported locale tags.
 * Add a new tag when adding a full catalog locale.
 */
export type LocaleTag = 'uk' | 'en';

/** All locale tags — used by the completeness checker. */
export const LOCALE_TAGS: readonly LocaleTag[] = ['uk', 'en'] as const;

// ---------------------------------------------------------------------------
// CatalogResource — flat key → string shape with register suffix convention
// ---------------------------------------------------------------------------

/**
 * A flat string-keyed catalog resource object.
 *
 * Keys follow the i18next `context` suffix convention for register variants:
 *   'error.notYet'         — bare key (fallback when context is absent)
 *   'error.notYet_warm'    — warm-register variant
 *   'error.notYet_neutral' — neutral-register variant
 *
 * All keys and values are strings; template interpolation vars use
 * `{{varName}}` syntax (i18next default).
 */
export type CatalogResource = Record<string, string>;
