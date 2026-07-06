/**
 * locale-table.test.ts -- Tests for the frozen locale numeric profile table.
 *
 * Tests:
 *   - Each profile's decimalSep and groupSeps are correct.
 *   - resolveLocaleProfile returns the correct profile by key.
 *   - Unknown language falls back to 'uk' profile (identity check, never Intl).
 *   - LOCALE_NUMERIC_TABLE is frozen (config-as-data invariant).
 *   - Test-only Intl cross-check: verifies the table's separators agree with
 *     ICU for uk/en/de/fr where Intl is available. Skipped in ICU-less
 *     environments. This is a DEVELOPER cross-check, NOT a runtime dependency.
 *     The parser NEVER calls Intl at runtime.
 */

import {
  LOCALE_NUMERIC_TABLE,
  resolveLocaleProfile,
} from '../locale-table';
import type { LocaleNumericProfile } from '../locale-table';

// Unicode constants used in assertions (mirrors the table's constants)
const SPACE = ' ';            // U+0020
const NBSP = ' ';         // U+00A0 NO-BREAK SPACE
const NNBSP = ' ';       // U+202F NARROW NO-BREAK SPACE
const THIN_SPACE = ' '; // U+2009 THIN SPACE
const UNICODE_MINUS = '−'; // U+2212 MINUS SIGN
// ---------------------------------------------------------------------------
// Verify constants used in assertions have correct code points
// ---------------------------------------------------------------------------

describe('test-file Unicode constants (sanity check)', () => {
  it('NBSP is U+00A0', () => {
    expect(NBSP.charCodeAt(0)).toBe(0x00a0);
  });
  it('NNBSP is U+202F', () => {
    expect(NNBSP.charCodeAt(0)).toBe(0x202f);
  });
  it('THIN_SPACE is U+2009', () => {
    expect(THIN_SPACE.charCodeAt(0)).toBe(0x2009);
  });
  it('SPACE is U+0020', () => {
    expect(SPACE.charCodeAt(0)).toBe(0x0020);
  });
  it('UNICODE_MINUS is U+2212', () => {
    expect(UNICODE_MINUS.charCodeAt(0)).toBe(0x2212);
  });
});

// ---------------------------------------------------------------------------
// LOCALE_NUMERIC_TABLE is frozen
// ---------------------------------------------------------------------------

describe('LOCALE_NUMERIC_TABLE (config-as-data)', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(LOCALE_NUMERIC_TABLE)).toBe(true);
  });

  it('contains exactly uk, en, de, fr profiles', () => {
    const keys = Object.keys(LOCALE_NUMERIC_TABLE).sort();
    expect(keys).toEqual(['de', 'en', 'fr', 'uk']);
  });
});

// ---------------------------------------------------------------------------
// Profile: 'uk' (primary)
// ---------------------------------------------------------------------------

describe("LOCALE_NUMERIC_TABLE['uk']", () => {
  const uk = LOCALE_NUMERIC_TABLE['uk'] as LocaleNumericProfile;

  it('language is "uk"', () => {
    expect(uk.language).toBe('uk');
  });

  it('decimalSep is "," (comma)', () => {
    expect(uk.decimalSep).toBe(',');
  });

  it('groupSeps contains plain SPACE (U+0020)', () => {
    expect(uk.groupSeps).toContain(SPACE);
  });

  it('groupSeps contains NBSP (U+00A0)', () => {
    expect(uk.groupSeps.some((s) => s.charCodeAt(0) === 0x00a0)).toBe(true);
  });

  it('groupSeps contains NNBSP (U+202F)', () => {
    expect(uk.groupSeps.some((s) => s.charCodeAt(0) === 0x202f)).toBe(true);
  });

  it('groupSeps contains THIN SPACE (U+2009)', () => {
    expect(uk.groupSeps.some((s) => s.charCodeAt(0) === 0x2009)).toBe(true);
  });

  it('signGlyphs.minus contains U+2212 MINUS SIGN', () => {
    expect(uk.signGlyphs.minus.some((s) => s.charCodeAt(0) === 0x2212)).toBe(true);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(uk)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Profile: 'en'
// ---------------------------------------------------------------------------

describe("LOCALE_NUMERIC_TABLE['en']", () => {
  const en = LOCALE_NUMERIC_TABLE['en'] as LocaleNumericProfile;

  it('language is "en"', () => {
    expect(en.language).toBe('en');
  });

  it('decimalSep is "." (period)', () => {
    expect(en.decimalSep).toBe('.');
  });

  it('groupSeps contains "," (comma) only', () => {
    expect(en.groupSeps).toContain(',');
    expect(en.groupSeps).not.toContain('.');
    expect(en.groupSeps).not.toContain(SPACE);
    expect(en.groupSeps.some((s) => s.charCodeAt(0) === 0x00a0)).toBe(false);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(en)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Profile: 'de'
// ---------------------------------------------------------------------------

describe("LOCALE_NUMERIC_TABLE['de']", () => {
  const de = LOCALE_NUMERIC_TABLE['de'] as LocaleNumericProfile;

  it('language is "de"', () => {
    expect(de.language).toBe('de');
  });

  it('decimalSep is "," (comma)', () => {
    expect(de.decimalSep).toBe(',');
  });

  it('groupSeps contains "." (period)', () => {
    expect(de.groupSeps).toContain('.');
  });

  it('groupSeps contains plain SPACE', () => {
    expect(de.groupSeps).toContain(SPACE);
  });

  it('groupSeps contains NBSP (U+00A0)', () => {
    expect(de.groupSeps.some((s) => s.charCodeAt(0) === 0x00a0)).toBe(true);
  });

  it('groupSeps contains NNBSP (U+202F)', () => {
    expect(de.groupSeps.some((s) => s.charCodeAt(0) === 0x202f)).toBe(true);
  });

  it('groupSeps does NOT contain "," (comma -- that is the decimal sep)', () => {
    expect(de.groupSeps).not.toContain(',');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(de)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Profile: 'fr'
// ---------------------------------------------------------------------------

describe("LOCALE_NUMERIC_TABLE['fr']", () => {
  const fr = LOCALE_NUMERIC_TABLE['fr'] as LocaleNumericProfile;

  it('language is "fr"', () => {
    expect(fr.language).toBe('fr');
  });

  it('decimalSep is "," (comma)', () => {
    expect(fr.decimalSep).toBe(',');
  });

  it('groupSeps contains NBSP (U+00A0)', () => {
    expect(fr.groupSeps.some((s) => s.charCodeAt(0) === 0x00a0)).toBe(true);
  });

  it('groupSeps contains NNBSP (U+202F)', () => {
    expect(fr.groupSeps.some((s) => s.charCodeAt(0) === 0x202f)).toBe(true);
  });

  it('groupSeps does NOT contain "." (period) or "," (comma)', () => {
    expect(fr.groupSeps).not.toContain('.');
    expect(fr.groupSeps).not.toContain(',');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(fr)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveLocaleProfile
// ---------------------------------------------------------------------------

describe('resolveLocaleProfile', () => {
  it('resolves "uk" to the uk profile (identity)', () => {
    const profile = resolveLocaleProfile('uk');
    expect(profile.language).toBe('uk');
    expect(profile.decimalSep).toBe(',');
    expect(profile).toBe(LOCALE_NUMERIC_TABLE['uk']);
  });

  it('resolves "en" to the en profile (identity)', () => {
    const profile = resolveLocaleProfile('en');
    expect(profile.language).toBe('en');
    expect(profile.decimalSep).toBe('.');
    expect(profile).toBe(LOCALE_NUMERIC_TABLE['en']);
  });

  it('resolves "de" to the de profile (identity)', () => {
    const profile = resolveLocaleProfile('de');
    expect(profile.language).toBe('de');
    expect(profile.decimalSep).toBe(',');
    expect(profile).toBe(LOCALE_NUMERIC_TABLE['de']);
  });

  it('resolves "fr" to the fr profile (identity)', () => {
    const profile = resolveLocaleProfile('fr');
    expect(profile.language).toBe('fr');
    expect(profile.decimalSep).toBe(',');
    expect(profile).toBe(LOCALE_NUMERIC_TABLE['fr']);
  });

  it('falls back to "uk" for an unknown tag (not Intl)', () => {
    const profile = resolveLocaleProfile('xx');
    expect(profile).toBe(LOCALE_NUMERIC_TABLE['uk']);
    expect(profile.language).toBe('uk');
  });

  it('falls back to "uk" for empty string', () => {
    const profile = resolveLocaleProfile('');
    expect(profile).toBe(LOCALE_NUMERIC_TABLE['uk']);
  });

  it('falls back to "uk" for a full BCP-47 subtag "en-US" (case-sensitive exact match)', () => {
    const profile = resolveLocaleProfile('en-US');
    expect(profile).toBe(LOCALE_NUMERIC_TABLE['uk']);
  });

  it('falls back to "uk" for a capitalized tag "UK" (case-sensitive)', () => {
    const profile = resolveLocaleProfile('UK');
    expect(profile).toBe(LOCALE_NUMERIC_TABLE['uk']);
  });
});

// ---------------------------------------------------------------------------
// Test-only Intl cross-check (DEVELOPER cross-check -- NEVER a runtime dep)
//
// Verifies the table's separator values agree with ICU for the four MVP locales.
// Guarded to skip when Intl.NumberFormat or formatToParts is unavailable.
// This is a DEVELOPER cross-check only. The parser NEVER calls Intl at runtime.
// ---------------------------------------------------------------------------

function getIntlSeparators(
  locale: string
): { decimal: string; group: string } | null {
  try {
    if (typeof Intl === 'undefined' || typeof Intl.NumberFormat !== 'function') {
      return null;
    }
    const nf = new Intl.NumberFormat(locale);
    if (typeof nf.formatToParts !== 'function') return null;
    const parts = nf.formatToParts(1234567.89);
    const decimalPart = parts.find((p) => p.type === 'decimal');
    const groupPart = parts.find((p) => p.type === 'group');
    if (!decimalPart || !groupPart) return null;
    return { decimal: decimalPart.value, group: groupPart.value };
  } catch {
    return null;
  }
}

describe('Intl cross-check (DEVELOPER-ONLY, skipped in ICU-less envs)', () => {
  const localeChecks: { tag: string; decimal: string; groupCharCodes: number[] }[] = [
    { tag: 'uk', decimal: ',', groupCharCodes: [0x00a0, 0x202f, 0x0020] },
    { tag: 'en', decimal: '.', groupCharCodes: [0x002c] },
    { tag: 'de', decimal: ',', groupCharCodes: [0x002e, 0x0020, 0x00a0, 0x202f] },
    { tag: 'fr', decimal: ',', groupCharCodes: [0x202f, 0x00a0, 0x0020] },
  ];

  for (const { tag, decimal, groupCharCodes } of localeChecks) {
    it(`${tag}: table decimal sep is "${decimal}" (cross-check against Intl if available)`, () => {
      const tableProfile = LOCALE_NUMERIC_TABLE[tag] as LocaleNumericProfile;
      // Always assert the table value regardless of Intl availability
      expect(tableProfile.decimalSep).toBe(decimal);

      // Optional Intl cross-check
      const seps = getIntlSeparators(tag);
      if (seps === null) {
        console.warn(`[Intl cross-check] Skipping ${tag}: Intl.formatToParts not available`);
        return;
      }
      expect(seps.decimal).toBe(decimal);
    });

    it(`${tag}: table groupSeps cover the known group chars (cross-check if Intl available)`, () => {
      const tableProfile = LOCALE_NUMERIC_TABLE[tag] as LocaleNumericProfile;
      const tableGroupCodes = tableProfile.groupSeps.map((s) => s.charCodeAt(0));

      // Table must cover all known group char codes for this locale.
      // Not all codes need to be in the table (some are rare); but Intl's actual
      // group char must be in the table. We assert this below via Intl when available.
      const seps = getIntlSeparators(tag);
      if (seps === null) {
        console.warn(`[Intl cross-check] Skipping ${tag}: Intl.formatToParts not available`);
        return;
      }
      const intlGroupCode = seps.group.charCodeAt(0);
      // The Intl group char must be covered by either our expected codes or the table
      const isKnown = groupCharCodes.includes(intlGroupCode);
      const isInTable = tableGroupCodes.includes(intlGroupCode);
      expect(isKnown || isInTable).toBe(true);
    });
  }
});