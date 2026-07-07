/**
 * i18n.test.ts
 *
 * Tests for the i18next instance initialization in src/i18n/i18n.ts.
 *
 * Covers:
 *   - Default language is 'uk'
 *   - initI18n() changes the active language
 *   - Ukrainian catalog resolves correctly (known keys)
 *   - English override resolves English strings
 *   - Unknown key returns the key itself (i18next default)
 *   - Register context resolves the correct variant
 *   - initI18n() falls back to 'uk' for unsupported language tags
 */

// Mock expo-localization before importing i18n (it imports getLocales on init).
// The manual mock at __mocks__/expo-localization.js returns uk-UA by default.

import i18n, { initI18n } from '../i18n';

// ---------------------------------------------------------------------------
// Helper: run each test with a fresh i18n state
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Reset to default 'uk' language before each test.
  await i18n.changeLanguage('uk');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('i18n initialization', () => {
  it('defaults to Ukrainian language', () => {
    expect(i18n.language).toBe('uk');
  });

  it('resolves a known Ukrainian key', () => {
    const result = i18n.t('nav.nodeMap');
    expect(result).toBe('Карта тем');
  });

  it('resolves a warm-register Ukrainian key', () => {
    const result = i18n.t('error.notYet', { context: 'warm' });
    expect(result).toContain('ще'); // warm Ukrainian uses "Ще не зовсім"
  });

  it('resolves a neutral-register Ukrainian key', () => {
    const result = i18n.t('error.notYet', { context: 'neutral' });
    expect(result).toContain('Не зовсім вірно');
  });
});

describe('initI18n', () => {
  it('changes the language to English when called with "en"', async () => {
    await initI18n('en');
    expect(i18n.language).toBe('en');
    const result = i18n.t('nav.nodeMap');
    expect(result).toBe('Skill Map');
  });

  it('falls back to "uk" for an unsupported language tag', async () => {
    await initI18n('fr'); // French not supported
    expect(i18n.language).toBe('uk');
  });

  it('keeps "uk" when called with "uk"', async () => {
    await initI18n('uk');
    expect(i18n.language).toBe('uk');
  });

  it('falls back to "uk" for an empty string', async () => {
    // Empty string → device detection in the mock returns 'uk-UA' → 'uk'
    await initI18n('');
    expect(i18n.language).toBe('uk');
  });
});

describe('unknown key behavior', () => {
  it('returns the key itself for a missing key (i18next default)', () => {
    const result = i18n.t('__nonexistent.key__');
    expect(result).toBe('__nonexistent.key__');
  });
});

// ---------------------------------------------------------------------------
// Ukrainian pluralization — день / дні / днів via Intl.PluralRules
// ---------------------------------------------------------------------------

describe('Ukrainian plural forms (streak counts)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('uk');
  });

  it('1 → день (one)', () => {
    expect(i18n.t('streak.kept', { count: 1, context: 'neutral' })).toBe('1 день поспіль.');
  });

  it('2 → дні (few)', () => {
    expect(i18n.t('streak.kept', { count: 2, context: 'neutral' })).toBe('2 дні поспіль.');
  });

  it('5 → днів (many)', () => {
    expect(i18n.t('streak.kept', { count: 5, context: 'neutral' })).toBe('5 днів поспіль.');
  });

  it('21 → день (one again — Ukrainian cycles)', () => {
    expect(i18n.t('streak.kept', { count: 21, context: 'neutral' })).toBe('21 день поспіль.');
  });

  it('warm register pluralizes too', () => {
    expect(i18n.t('streak.kept', { count: 3, context: 'warm' })).toContain('3 дні поспіль');
  });
});
