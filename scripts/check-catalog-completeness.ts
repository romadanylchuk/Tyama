/**
 * scripts/check-catalog-completeness.ts
 *
 * Standalone CI script that verifies the shipped i18n catalogs have all
 * required register variants for every no-shame-critical key.
 *
 * A missing critical register variant is a BUILD ERROR — this script exits
 * with code 1 when any violations are found.
 *
 * USAGE (compile then run, or via ts-node / tsx):
 *   npx tsx scripts/check-catalog-completeness.ts
 *   # or: tsc && node dist/scripts/check-catalog-completeness.js
 *
 * This script is intentionally a duplicate entry-point alongside the jest test
 * (src/i18n/__tests__/catalog-completeness.test.ts) so it can run in CI
 * pipelines that don't use jest (e.g. a dedicated pre-build check step).
 *
 * The jest test is the BINDING gate — if this script passes but the test fails
 * (or vice versa), investigate the catalog state. They share the same pure
 * checker function (findMissingRegisterVariants) so results should be identical.
 */

import { findMissingRegisterVariants, formatViolation } from '../src/i18n/completeness';
import { CRITICAL_KEY_PREFIXES } from '../src/i18n/criticality';
import { REGISTERS } from '../src/i18n/catalog-types';
import uk from '../src/i18n/locales/uk';
import en from '../src/i18n/locales/en';

const catalogs = { uk, en };

const violations = findMissingRegisterVariants(catalogs, CRITICAL_KEY_PREFIXES, REGISTERS);

if (violations.length === 0) {
  console.log('✓ Catalog completeness: all no-shame-critical register variants present.');
  process.exit(0);
} else {
  console.error(`✗ Catalog completeness: ${violations.length} violation(s) found!\n`);
  for (const v of violations) {
    console.error('  ' + formatViolation(v));
  }
  console.error(
    '\nFix: add the missing register variants to the appropriate locale catalog.',
  );
  process.exit(1);
}
