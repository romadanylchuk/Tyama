/**
 * locale-table.ts -- Frozen config-as-data locale numeric profile table.
 *
 * DESIGN: This table is the SOLE runtime authority on how numbers are formatted
 * in each supported language. It is NOT derived from Intl at runtime.
 *
 * WHY NOT Intl?
 *   Hermes (the React Native JS engine used by Expo) ships without full ICU;
 *   Intl.NumberFormat.formatToParts is platform-variable on Android. Its failure
 *   mode is the fatal class: a misparse marks a CORRECT answer wrong for an
 *   anxious learner. The frozen table eliminates that variance entirely.
 *
 *   Intl IS used -- but only inside __tests__ as a developer cross-check that the
 *   table agrees with ICU on machines where ICU is available (guarded to skip in
 *   ICU-less environments). It is never called at runtime.
 *
 * AMBIGUOUS-GROUPING RESOLUTION POLICY:
 *   The active locale profile decides ambiguous grouping DETERMINISTICALLY --
 *   never by value shape.
 *
 *   Example: '1,000'
 *     - Under 'en' (comma is a group sep):           -> 1000
 *     - Under 'uk'/'de'/'fr' (comma is decimal sep): -> 1.0
 *
 *   A value-shape heuristic is explicitly rejected: it would be a
 *   silent-misparse vector. The active locale profile is the only authority.
 *
 * UNKNOWN LANGUAGE FALLBACK:
 *   resolveLocaleProfile(tag) returns the frozen 'uk' profile for any unknown
 *   tag. Never falls back to Intl. The primary language (Ukrainian) is the
 *   deliberate default because the MVP targets Ukrainian learners.
 *
 * CONFIG-AS-DATA:
 *   Like RETENTION_POLICY, this table is a frozen literal. Adding a locale =
 *   adding an entry here -- no code change to the parser or checker.
 */

// ---------------------------------------------------------------------------
// Unicode constants for space/sign characters used in numeric formatting
// ---------------------------------------------------------------------------

/** U+0020 -- ASCII/plain space. Used as group separator in UK, DE, FR. */
const SPACE = ' ';
/** U+00A0 -- NO-BREAK SPACE (NBSP). Common in UA/DE/FR numeric formatting. */
const NBSP = ' ';
/** U+202F -- NARROW NO-BREAK SPACE (NNBSP). Common in FR/UA typography. */
const NNBSP = ' ';
/** U+2009 -- THIN SPACE. Appears in some UA numeric styles. */
const THIN_SPACE = ' ';

/**
 * U+2212 -- MINUS SIGN (visually identical to hyphen-minus U+002D; distinct
 * code point). Common in typeset mathematics and copy-pasted answers.
 */
const UNICODE_MINUS = '−';

// ---------------------------------------------------------------------------
// LocaleNumericProfile -- the shape of one locale's numeric formatting rules
// ---------------------------------------------------------------------------

/**
 * A frozen value object describing how numbers are formatted in one language.
 *
 * Consumed by:
 *   - parseLocaleNumber() -- strips group seps, maps decimal sep -> '.'
 *   - NumberWidget (stage 03) -- renders locale-correct keypad decimal glyph
 *     (via keypadDecimalGlyph(profile)).
 *
 * OPERATOR GLYPHS are NOT included here -- the scalar parser sees one scalar
 * slot at a time; composite decomposition is done generator-side.
 */
export interface LocaleNumericProfile {
  /** BCP-47 language tag this profile describes (e.g. 'uk', 'en', 'de', 'fr'). */
  readonly language: string;
  /**
   * The decimal separator character for this locale.
   * Exactly one character. Mapped to '.' (ASCII) inside the parser.
   */
  readonly decimalSep: string;
  /**
   * All digit-grouping separator characters/strings for this locale.
   * Stripped (removed, not mapped) by the parser before the decimal mapping.
   */
  readonly groupSeps: readonly string[];
  /**
   * Sign glyph variants recognized for this locale.
   * The parser maps minus variants -> '-' and strips leading '+'.
   */
  readonly signGlyphs: {
    /** Code points accepted as a minus sign (mapped to U+002D '-'). */
    readonly minus: readonly string[];
    /** Code points accepted as a leading plus sign (stripped). */
    readonly plus: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// LOCALE_NUMERIC_TABLE -- the frozen config-as-data table
// ---------------------------------------------------------------------------

/**
 * Frozen locale numeric profile table keyed by BCP-47 language tag.
 *
 * 'uk' -- Ukrainian (PRIMARY / fallback default)
 *         decimal: ','   group: SPACE(U+0020) NBSP(U+00A0) NNBSP(U+202F) THIN(U+2009)
 *         '3,5' = 3.5;  '1 000' = 1000 (any space variant)
 *
 * 'en' -- English
 *         decimal: '.'   group: ',' only
 *         '3.5' = 3.5;  '1,000' = 1000
 *
 * 'de' -- German
 *         decimal: ','   group: '.'(period) SPACE NBSP NNBSP
 *         '3,5' = 3.5;  '1.000' = 1000;  '1 000' = 1000
 *
 * 'fr' -- French
 *         decimal: ','   group: NBSP NNBSP SPACE
 *         '3,5' = 3.5;  '1 000' = 1000
 *
 * Sign glyph shared across all locales:
 *   U+2212 MINUS SIGN -> mapped to U+002D HYPHEN-MINUS
 */
export const LOCALE_NUMERIC_TABLE: Readonly<Record<string, LocaleNumericProfile>> =
  Object.freeze({
    uk: Object.freeze({
      language: 'uk',
      decimalSep: ',',
      groupSeps: Object.freeze([SPACE, NBSP, NNBSP, THIN_SPACE]),
      signGlyphs: Object.freeze({
        minus: Object.freeze([UNICODE_MINUS]),
        plus: Object.freeze(['+']),
      }),
    } as LocaleNumericProfile),

    en: Object.freeze({
      language: 'en',
      decimalSep: '.',
      groupSeps: Object.freeze([',']),
      signGlyphs: Object.freeze({
        minus: Object.freeze([UNICODE_MINUS]),
        plus: Object.freeze(['+']),
      }),
    } as LocaleNumericProfile),

    de: Object.freeze({
      language: 'de',
      decimalSep: ',',
      groupSeps: Object.freeze(['.', SPACE, NBSP, NNBSP]),
      signGlyphs: Object.freeze({
        minus: Object.freeze([UNICODE_MINUS]),
        plus: Object.freeze(['+']),
      }),
    } as LocaleNumericProfile),

    fr: Object.freeze({
      language: 'fr',
      decimalSep: ',',
      groupSeps: Object.freeze([NBSP, NNBSP, SPACE]),
      signGlyphs: Object.freeze({
        minus: Object.freeze([UNICODE_MINUS]),
        plus: Object.freeze(['+']),
      }),
    } as LocaleNumericProfile),
  });

// ---------------------------------------------------------------------------
// resolveLocaleProfile -- the single lookup + fallback function
// ---------------------------------------------------------------------------

/**
 * resolveLocaleProfile(language) -> LocaleNumericProfile
 *
 * Returns the frozen LocaleNumericProfile for the given BCP-47 language tag.
 *
 * FALLBACK RULE: Unknown tags fall back to the frozen 'uk' profile (never Intl).
 *
 * @param language -- BCP-47 language tag (e.g. 'uk', 'en', 'de', 'fr').
 *                    Case-sensitive; primary subtag only ('en', not 'en-US').
 */
export function resolveLocaleProfile(language: string): LocaleNumericProfile {
  return LOCALE_NUMERIC_TABLE[language] ?? LOCALE_NUMERIC_TABLE['uk']!;
}