/**
 * catalog-completeness.test.ts
 *
 * Jest gate for the i18n register-completeness invariant.
 *
 * This test FAILS THE BUILD when a no-shame-critical key is missing a required
 * register variant in any shipped locale. It is the binding gate — the standalone
 * CI script (scripts/check-catalog-completeness.ts) must agree with it.
 *
 * TWO TEST SUITES:
 *
 *   1. "shipped catalogs" — runs findMissingRegisterVariants over the real uk.ts
 *      and en.ts catalogs and asserts zero violations.
 *
 *   2. "fixture catalogs" — proves that the checker DETECTS violations when a
 *      critical register variant is missing from a fixture catalog. If this suite
 *      fails, the checker itself is broken (false-negative risk).
 */

import { findMissingRegisterVariants, formatViolation } from '../completeness';
import type { CatalogMap } from '../completeness';
import { CRITICAL_KEY_PREFIXES } from '../criticality';
import { REGISTERS } from '../catalog-types';
import uk from '../locales/uk';
import en from '../locales/en';

// ---------------------------------------------------------------------------
// Suite 1 — shipped catalogs must be complete
// ---------------------------------------------------------------------------

describe('shipped catalogs — register completeness', () => {
  const catalogs: CatalogMap = { uk, en };

  it('has no missing register variants for no-shame-critical keys', () => {
    const violations = findMissingRegisterVariants(catalogs, CRITICAL_KEY_PREFIXES, REGISTERS);
    if (violations.length > 0) {
      const lines = violations.map(formatViolation).join('\n');
      fail(`Catalog completeness violations found:\n${lines}`);
    }
    expect(violations).toHaveLength(0);
  });

  it('detects at least one no-shame-critical key (sanity check)', () => {
    // If no critical keys exist, the gate is trivially passing for the wrong reason.
    const allKeys = [...Object.keys(uk), ...Object.keys(en)];
    const hasCritical = allKeys.some((k) =>
      CRITICAL_KEY_PREFIXES.some((prefix) => k.startsWith(prefix)),
    );
    expect(hasCritical).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — fixture: checker detects violations (proves the gate is real)
// ---------------------------------------------------------------------------

describe('fixture catalogs — checker detects violations', () => {
  it('reports a violation when a critical _warm variant is missing', () => {
    // Fixture: a catalog with 'error.notYet_neutral' but WITHOUT 'error.notYet_warm'.
    const fixtureCatalog: CatalogMap = {
      uk: {
        'error.notYet_neutral': 'Neutral copy',
        // Intentionally MISSING: 'error.notYet_warm'
      },
    };
    const violations = findMissingRegisterVariants(
      fixtureCatalog,
      CRITICAL_KEY_PREFIXES,
      REGISTERS,
    );
    expect(violations.length).toBeGreaterThan(0);
    const hasWarmViolation = violations.some(
      (v) => v.bareKey === 'error.notYet' && v.register === 'warm' && v.locale === 'uk',
    );
    expect(hasWarmViolation).toBe(true);
  });

  it('reports a violation when a critical _neutral variant is missing', () => {
    const fixtureCatalog: CatalogMap = {
      uk: {
        'error.notYet_warm': 'Warm copy',
        // Intentionally MISSING: 'error.notYet_neutral'
      },
    };
    const violations = findMissingRegisterVariants(
      fixtureCatalog,
      CRITICAL_KEY_PREFIXES,
      REGISTERS,
    );
    const hasNeutralViolation = violations.some(
      (v) => v.bareKey === 'error.notYet' && v.register === 'neutral' && v.locale === 'uk',
    );
    expect(hasNeutralViolation).toBe(true);
  });

  it('does NOT report a violation for ordinary (non-critical) keys', () => {
    // Fixture: a catalog with only a bare 'nav.nodeMap' key — no register variants.
    // 'nav.nodeMap' starts with 'nav.' which is NOT in CRITICAL_KEY_PREFIXES.
    const fixtureCatalog: CatalogMap = {
      uk: {
        'nav.nodeMap': 'Карта тем',
        // No nav.nodeMap_warm or nav.nodeMap_neutral — that's allowed.
      },
    };
    const violations = findMissingRegisterVariants(
      fixtureCatalog,
      CRITICAL_KEY_PREFIXES,
      REGISTERS,
    );
    expect(violations).toHaveLength(0);
  });

  it('reports violations in both locales when a catalog entry is absent in both', () => {
    const fixtureCatalog: CatalogMap = {
      uk: { 'error.tryAgain_warm': 'warm uk' },
      en: { 'error.tryAgain_warm': 'warm en' },
      // Both locales missing 'error.tryAgain_neutral'
    };
    const violations = findMissingRegisterVariants(
      fixtureCatalog,
      CRITICAL_KEY_PREFIXES,
      REGISTERS,
    );
    const neutralViolations = violations.filter(
      (v) => v.bareKey === 'error.tryAgain' && v.register === 'neutral',
    );
    // Both locales should report the missing neutral variant
    expect(neutralViolations.length).toBe(2);
    const locales = neutralViolations.map((v) => v.locale).sort();
    expect(locales).toEqual(['en', 'uk']);
  });
});

// ---------------------------------------------------------------------------
// Plural-suffixed critical keys — stripped to the bare key, never treated as
// their own critical namespace (regression for the uk plural variants).
// ---------------------------------------------------------------------------

describe('plural-suffixed keys resolve to their bare key', () => {
  it('a critical key with register+plural variants produces NO violations', () => {
    const fixtureCatalog: CatalogMap = {
      uk: {
        'streak.kept_warm': 'base warm',
        'streak.kept_neutral': 'base neutral',
        'streak.kept_warm_few': 'few warm',
        'streak.kept_neutral_many': 'many neutral',
      },
    };
    const violations = findMissingRegisterVariants(
      fixtureCatalog,
      CRITICAL_KEY_PREFIXES,
      REGISTERS,
    );
    expect(violations).toHaveLength(0);
  });

  it('a plural variant does NOT satisfy a missing register variant', () => {
    const fixtureCatalog: CatalogMap = {
      uk: {
        'streak.kept_warm': 'base warm',
        'streak.kept_warm_few': 'few warm',
        // MISSING: streak.kept_neutral
      },
    };
    const violations = findMissingRegisterVariants(
      fixtureCatalog,
      CRITICAL_KEY_PREFIXES,
      REGISTERS,
    );
    const missingNeutral = violations.some(
      (v) => v.bareKey === 'streak.kept' && v.register === 'neutral',
    );
    expect(missingNeutral).toBe(true);
  });
});
