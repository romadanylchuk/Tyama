/**
 * parse-locale-number.ts -- Pure locale-aware numeric normalizer.
 *
 * parseLocaleNumber(rawInput, profile) -> ParseResult
 *
 * Converts a learner-typed string to a JS number using only the locale profile
 * for separator rules. PURE: no Intl, no settings read, no side effects.
 *
 * POSITION IN THE PIPELINE:
 *   parseLocaleNumber(rawInput, localeProfile)   <- this module
 *     -> { ok: true, value: number }
 *       -> canonicalize(value)                   <- src/core/canonical (stage 02)
 *         -> compared to step.expected            <- exact string equality
 *
 * TWO-FUNCTION SPLIT (D1):
 *   This function folds ONLY the locale layer: strip group seps, map decimal
 *   sep -> '.', normalize sign glyphs. It returns a JS number -- not a canonical
 *   string. canonicalize() (from @/core) remains the SOLE number->string site.
 *   Having two number->string implementations would be the fatal divergence class.
 *
 * AMBIGUOUS GROUPING (DL-3):
 *   Resolved DETERMINISTICALLY by the active profile. '1,000' parsed under 'en'
 *   yields 1000 (comma is a group sep). Under 'uk'/'de'/'fr' it yields 1.0
 *   (comma is the decimal sep). No value-shape heuristic anywhere.
 *
 * PARSE ORDER PER INPUT:
 *   1. Trim surrounding whitespace
 *   2. Empty check -> ParseError('empty')
 *   3. Normalize sign glyphs (U+2212 minus -> '-'; strip leading '+')
 *   4. Strip all group separators from profile.groupSeps (removes them entirely)
 *   5. Map profile.decimalSep -> '.' (the JS decimal separator)
 *   6. Reject any remaining non-[0-9.\-] character -> ParseError('unrecognized-glyph')
 *   7. Reject doubled/trailing separators -> ParseError('doubled-separator')
 *   8. Reject multiple decimal points -> ParseError('multiple-decimals')
 *   9. Number(cleaned) -- if NaN/non-finite -> ParseError('not-a-number')
 *  10. Return { ok: true, value }
 *
 * SIGN GLYPH NORMALIZATION:
 *   - U+2212 MINUS SIGN ('−') -> ASCII '-' (U+002D)
 *   - Leading '+' -> stripped (value is positive; sign recorded implicitly)
 *   All profile.signGlyphs.minus variants are mapped. Only ONE sign glyph is
 *   recognized at most -- a second sign glyph in the middle of a number is an
 *   unrecognized-glyph error (e.g. '3−5' is rejected).
 *
 * OPERATOR GLYPHS (x, ÷, middle dot):
 *   Not handled here. The scalar parser sees ONE scalar slot at a time;
 *   composite decomposition (fraction □/□, multi-slot) is generator-side.
 *   A '/' or '*' in a single slot is therefore 'unrecognized-glyph'.
 *
 * INTL:
 *   NEVER called here. Intl.NumberFormat is test-only (see __tests__/).
 */

import type { LocaleNumericProfile } from './locale-table';
import { makeParseError } from './parse-error';
import type { ParseError } from './parse-error';

// ---------------------------------------------------------------------------
// ParseResult type
// ---------------------------------------------------------------------------

/**
 * The discriminated-union result of parseLocaleNumber().
 *
 *   { ok: true;  value: number } -- successful parse; value is a finite JS number.
 *   { ok: false; error: ParseError } -- structured failure (returned, never thrown).
 *
 * On failure the caller returns the error as a 'parse-error' CheckResult outcome
 * WITHOUT emitting any firehose event (anti-shame structural invariant: a
 * formatting slip is not a skill failure and must be invisible to scoring).
 */
export type ParseResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly error: ParseError };

// ---------------------------------------------------------------------------
// parseLocaleNumber -- the pure normalizer
// ---------------------------------------------------------------------------

/**
 * parseLocaleNumber(rawInput, profile) -> ParseResult
 *
 * Pure locale-aware numeric normalizer. Converts a learner-typed string to a
 * JS number according to the locale profile's separator rules.
 *
 * PURE: no Intl, no settings read, no mutation of external state. The caller
 * (the stage-06 screen or test harness) resolves the profile from the active
 * contentLanguage via resolveLocaleProfile() and passes it in.
 *
 * @param rawInput -- The raw string as typed by the learner (may contain locale
 *                    separators, Unicode sign glyphs, surrounding whitespace).
 * @param profile  -- Frozen LocaleNumericProfile for the active contentLanguage.
 *                    Resolved by the caller via resolveLocaleProfile(); never
 *                    read from settings inside this function.
 *
 * @returns ParseResult -- { ok: true, value } on success;
 *                         { ok: false, error: ParseError } on any failure.
 *                         NEVER throws (structured return for all error paths).
 */
export function parseLocaleNumber(
  rawInput: string,
  profile: LocaleNumericProfile
): ParseResult {
  // -------------------------------------------------------------------------
  // Step 1: Trim surrounding whitespace
  // -------------------------------------------------------------------------
  let s = rawInput.trim();

  // -------------------------------------------------------------------------
  // Step 2: Empty check
  // -------------------------------------------------------------------------
  if (s.length === 0) {
    return { ok: false, error: makeParseError('empty', rawInput) };
  }

  // -------------------------------------------------------------------------
  // Step 3: Normalize sign glyphs
  //
  // All profile.signGlyphs.minus variants -> ASCII '-' (U+002D)
  // Leading '+' -> stripped (positive; no change to value)
  //
  // We only accept a sign glyph at position 0. A sign glyph elsewhere in the
  // string (e.g. '3−5') is an unrecognized-glyph error caught in step 6.
  // -------------------------------------------------------------------------
  for (const minusGlyph of profile.signGlyphs.minus) {
    if (s.startsWith(minusGlyph)) {
      s = '-' + s.slice(minusGlyph.length);
      break; // only one sign glyph at position 0
    }
  }
  // Strip leading '+'
  if (s.startsWith('+')) {
    s = s.slice(1);
  }

  // -------------------------------------------------------------------------
  // Step 4: Strip group separators
  //
  // Each separator in profile.groupSeps is removed (not mapped). We iterate
  // all group seps and remove all occurrences of each. The decimal sep is NOT
  // in groupSeps, so it survives this step.
  //
  // Order of removal matters for profiles where a group sep could conflict with
  // the decimal sep: e.g. in 'de', '.' is a group sep and ',' is the decimal.
  // Stripping '.' group seps first correctly turns '1.000,5' -> '1000,5'.
  // -------------------------------------------------------------------------
  for (const groupSep of profile.groupSeps) {
    // Escape for RegExp: some group seps may be '.' which is a regex metachar
    const escaped = escapeRegExp(groupSep);
    s = s.replace(new RegExp(escaped, 'g'), '');
  }

  // -------------------------------------------------------------------------
  // Step 5: Map locale decimal separator -> '.'
  //
  // Replace the first (and only valid) occurrence of profile.decimalSep with
  // '.'. If decimalSep is already '.' (English), this is a no-op.
  // -------------------------------------------------------------------------
  if (profile.decimalSep !== '.') {
    // Replace the first occurrence only; multiple occurrences are caught in
    // step 8 (multiple-decimals) AFTER this replacement.
    s = s.replace(profile.decimalSep, '.');
  }

  // -------------------------------------------------------------------------
  // Step 6: Reject unrecognized glyphs
  //
  // After sign normalization, group-sep stripping, and decimal mapping, the
  // ONLY characters that should remain are:
  //   digits [0-9], decimal point '.', and a leading '-' (if negative).
  //
  // Any other character is an unrecognized glyph -- never silently misparsed.
  // This catches operator glyphs (x, /, +, etc.), stray Unicode, copy-paste
  // artifacts, and perceptual-twin characters that are not in the profile.
  // -------------------------------------------------------------------------
  if (!/^-?[0-9]*\.?[0-9]*$/.test(s) || s === '-' || s === '.' || s === '-.') {
    // Distinguish: if the remaining issue is clearly a multi-decimal or
    // doubled-separator case, let those specific checks below handle it for
    // a more accurate error kind. Otherwise 'unrecognized-glyph'.
    //
    // A string like '3.5.2' passes the digit/dot check for each individual
    // character but fails the overall regex -- catch it below at step 8.
    // For any truly foreign glyph, return here.
    if (!onlyDigitsDotsAndLeadingMinus(s)) {
      return { ok: false, error: makeParseError('unrecognized-glyph', rawInput) };
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Reject doubled/trailing separators
  //
  // A doubled separator means two consecutive '.' or '.' at the very end
  // (e.g. '1..5', '3.'). We also catch a leading decimal with nothing before
  // it (e.g. '.5' is valid JS but here we want to allow it as 0.5 is canonical;
  // however a pure leading '.' with no digits after is malformed).
  //
  // Valid: '3.5', '.5' (will parse to 0.5 via Number())
  // Invalid: '3..5', '3.', '..5'
  // -------------------------------------------------------------------------
  if (/\.\./.test(s)) {
    return { ok: false, error: makeParseError('doubled-separator', rawInput) };
  }
  if (s.endsWith('.')) {
    return { ok: false, error: makeParseError('doubled-separator', rawInput) };
  }

  // -------------------------------------------------------------------------
  // Step 8: Reject multiple decimal points
  //
  // After the above steps, a string like '3.5.2' would still contain two '.'
  // characters. Count them.
  // -------------------------------------------------------------------------
  const dotCount = (s.match(/\./g) ?? []).length;
  if (dotCount > 1) {
    return { ok: false, error: makeParseError('multiple-decimals', rawInput) };
  }

  // -------------------------------------------------------------------------
  // Step 9: Parse to JS number
  // -------------------------------------------------------------------------
  const value = Number(s);

  if (isNaN(value)) {
    return { ok: false, error: makeParseError('not-a-number', rawInput) };
  }
  if (!isFinite(value)) {
    return { ok: false, error: makeParseError('malformed', rawInput) };
  }

  // -------------------------------------------------------------------------
  // Step 10: Success
  // -------------------------------------------------------------------------
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the string contains only digits, '.', and at most one
 * leading '-'. Used to distinguish unrecognized-glyph from other error kinds.
 */
function onlyDigitsDotsAndLeadingMinus(s: string): boolean {
  return /^-?[0-9.]*$/.test(s);
}

/**
 * Escape a string for use as a literal pattern in a RegExp constructor.
 * Escapes the RegExp metacharacters: . * + ? ^ $ { } [ ] | ( ) \
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
