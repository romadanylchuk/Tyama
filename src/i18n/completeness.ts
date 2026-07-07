/**
 * completeness.ts — Pure register-completeness checker for the i18n catalog.
 *
 * PURE: no I/O, no side effects, no React. Receives catalogs and config as
 * arguments and returns a list of violations. Deterministic.
 *
 * USAGE:
 *   findMissingRegisterVariants(catalogs, criticalPrefixes, registers)
 *   → string[]  (violation descriptions; empty array = all good)
 *
 * CONSUMED BY:
 *   1. src/i18n/__tests__/catalog-completeness.test.ts (jest gate — fails the
 *      build when a critical register variant is missing from the shipped
 *      catalogs).
 *   2. scripts/check-catalog-completeness.ts (standalone CI script — prints
 *      violations and exits non-zero when any are found).
 *
 * LOGIC:
 *   For every key in every catalog:
 *     - Strip any trailing register suffix ('_warm', '_neutral') to find
 *       the "bare key" (e.g. 'error.notYet' from 'error.notYet_warm').
 *     - If keyCriticality(bareKey) === 'no-shame-critical', ALL register
 *       variants ('key_warm', 'key_neutral') MUST be present in EVERY locale.
 *     - Ordinary keys: skip.
 *   Violations are stable-sorted (locale, key, variant) for deterministic output.
 */

import type { CatalogResource, Register } from './catalog-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A map of locale tag → catalog resource object.
 * Passed by the completeness checker callers (jest test + CI script).
 */
export type CatalogMap = Record<string, CatalogResource>;

/**
 * A single completeness violation.
 * Returned in the violations array from findMissingRegisterVariants.
 */
export interface CompletenessViolation {
  /** The locale tag where the variant is missing (e.g. 'uk', 'en'). */
  locale: string;
  /** The bare key (without register suffix) that is missing a variant. */
  bareKey: string;
  /** The missing register variant (e.g. 'warm', 'neutral'). */
  register: Register;
  /** The full expected key that is absent (e.g. 'error.notYet_warm'). */
  missingKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The separator between a bare key and its register suffix.
 * Must match the `contextSeparator` in i18n.ts ('_').
 */
const REGISTER_SEP = '_';

/**
 * i18next JSON-v4 plural-category suffixes (Intl.PluralRules categories).
 * A pluralized, register-variant key is built OUTSIDE-IN as
 * `key_context_plural` (e.g. 'streak.kept_warm_few'), so the plural suffix
 * must be stripped FIRST, then the register suffix, to recover the bare key.
 */
const PLURAL_SUFFIXES: readonly string[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * Strip an optional trailing plural suffix, then an optional register suffix,
 * returning the bare key.
 * Examples: 'error.notYet_warm' → 'error.notYet'
 *           'streak.kept_warm_few' → 'streak.kept'
 *
 * Returns the original key unchanged if no known suffix is found.
 */
function stripRegisterSuffix(key: string, registers: readonly Register[]): string {
  let stripped = key;
  for (const plural of PLURAL_SUFFIXES) {
    const suffix = REGISTER_SEP + plural;
    if (stripped.endsWith(suffix)) {
      stripped = stripped.slice(0, stripped.length - suffix.length);
      break;
    }
  }
  for (const reg of registers) {
    const suffix = REGISTER_SEP + reg;
    if (stripped.endsWith(suffix)) {
      return stripped.slice(0, stripped.length - suffix.length);
    }
  }
  return stripped;
}

// ---------------------------------------------------------------------------
// findMissingRegisterVariants — the core pure checker
// ---------------------------------------------------------------------------

/**
 * Find all missing register variants for no-shame-critical keys across
 * all locales in the supplied catalog map.
 *
 * @param catalogs        — Map of locale tag → flat catalog resource.
 * @param criticalPrefixes — Array of key prefixes that make a key critical.
 *                           Sourced from CRITICAL_KEY_PREFIXES in criticality.ts.
 * @param registers       — Array of all required register variants.
 *                          Sourced from REGISTERS in catalog-types.ts.
 * @returns Array of violation descriptions (empty = no violations).
 *
 * PURE: deterministic, no side effects. Violations are sorted for stable output.
 */
export function findMissingRegisterVariants(
  catalogs: CatalogMap,
  criticalPrefixes: readonly string[],
  registers: readonly Register[],
): CompletenessViolation[] {
  const violations: CompletenessViolation[] = [];

  // Build the set of all bare keys that are no-shame-critical across all locales.
  // We scan all keys in all catalogs so that a key present in one locale but
  // missing in another is still caught.
  const criticalBareKeys = new Set<string>();

  for (const catalog of Object.values(catalogs)) {
    for (const key of Object.keys(catalog)) {
      const bare = stripRegisterSuffix(key, registers);
      // Use the passed criticalPrefixes (config-as-data) to check criticality
      // independently of the keyCriticality() function, so the checker is
      // self-contained and doesn't depend on the criticality module's singleton.
      const isCritical = criticalPrefixes.some((prefix) => bare.startsWith(prefix));
      if (isCritical) {
        criticalBareKeys.add(bare);
      }
    }
  }

  // For each critical bare key, check every locale for every register variant.
  const sortedBareKeys = Array.from(criticalBareKeys).sort();
  const sortedLocales = Object.keys(catalogs).sort();

  for (const locale of sortedLocales) {
    const catalog = catalogs[locale];
    for (const bareKey of sortedBareKeys) {
      for (const register of registers) {
        const expectedKey = bareKey + REGISTER_SEP + register;
        if (!(expectedKey in catalog)) {
          violations.push({
            locale,
            bareKey,
            register,
            missingKey: expectedKey,
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// formatViolation — human-readable violation string for CI output
// ---------------------------------------------------------------------------

/**
 * Format a single violation as a human-readable string for CI output.
 */
export function formatViolation(v: CompletenessViolation): string {
  return `[${v.locale}] MISSING '${v.missingKey}' (bare key: '${v.bareKey}', register: '${v.register}')`;
}
