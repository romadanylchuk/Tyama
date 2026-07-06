const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const noRawSqlHotRead = require('./eslint-rules/no-raw-sql-hot-read');
const noDirectMilestoneMutation = require('./eslint-rules/no-direct-milestone-mutation');
const noAdhocNumberFormat = require('./eslint-rules/no-adhoc-number-format');

/**
 * ESLint flat config for Tyama.
 *
 * Extends the Expo recommended flat config and registers three project-local
 * rules that enforce the hybrid truth-model seam discipline:
 *
 *   local/no-raw-sql-hot-read
 *     Phase 6: REAL enforcement. Flags raw SQL reads of the settings table
 *     outside the settings repository.
 *     Exemption: src/repositories/settings-repository.ts (the implementation)
 *     Exemption: src/repositories/backup-repository.ts (bulk snapshot/restore
 *       — the settings access there is not a hot-state read; it gathers all
 *       rows for export or bulk-restores them on import. Distinct operational
 *       semantics from the hot read path.)
 *
 *   local/no-direct-milestone-mutation
 *     Phase 4: REAL enforcement.
 *     Exemption: src/repositories/milestone-gate.ts ONLY.
 *     Note: progress-repository.ts and events-repository.ts are NO LONGER
 *     exempt because the private helpers (_writeMilestoneState, _insertDurableEvent,
 *     _emitDurable) have been moved into milestone-gate.ts as truly module-local
 *     non-exported functions. Any NEW milestone-table SQL in those files will now
 *     correctly fire this rule.
 *
 *   local/no-adhoc-number-format
 *     Stage-02 Phase-1: Canonical-number spine enforcement.
 *     Flags ad-hoc number→string normalization (.toFixed, .toLocaleString,
 *     .toPrecision, String()) and Math.random() in src/core/** outside the
 *     canonical and rng modules. Ensures all number formatting routes through
 *     canonicalize() and all randomness routes through SeededRng.
 *     Exemption: src/core/canonical/** (the implementation)
 *     Exemption: src/core/rng/**      (the sole legitimate RNG site)
 *     Exemption: src/__tests__/eslint-rules-core.test.ts ONLY (the RuleTester
 *       suite that embeds the forbidden patterns as fixtures). This rule is NOT
 *       broadly exempted for all test files — other core test files remain
 *       subject to it (see the eslint-rules-core.test.ts block below).
 *
 * All rules are set to "error" so any future real-match violation breaks the
 * lint gate immediately.
 */
module.exports = defineConfig([
  ...expoConfig,
  {
    plugins: {
      local: {
        rules: {
          'no-raw-sql-hot-read': noRawSqlHotRead,
          'no-direct-milestone-mutation': noDirectMilestoneMutation,
          'no-adhoc-number-format': noAdhocNumberFormat,
        },
      },
    },
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'local/no-raw-sql-hot-read': 'error',
      'local/no-direct-milestone-mutation': 'error',
    },
  },
  // -------------------------------------------------------------------------
  // no-adhoc-number-format: scoped to src/core/** only.
  // Applied as a separate block so the glob target is precise and the
  // rule does not fire on src/db/**, src/repositories/**, etc.
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'local/no-adhoc-number-format': 'error',
    },
  },
  // Exempt the canonical module (it IS the implementation).
  {
    files: ['src/core/canonical/**/*.{ts,tsx}'],
    rules: {
      'local/no-adhoc-number-format': 'off',
    },
  },
  // Exempt the rng module (the sole legitimate site for Math operations
  // that map float outputs; stage-03+ generators use SeededRng, not Math.random).
  {
    files: ['src/core/rng/**/*.{ts,tsx}'],
    rules: {
      'local/no-adhoc-number-format': 'off',
    },
  },
  // Exempt the settings repository from the hot-read rule (it IS the implementation).
  {
    files: ['src/repositories/settings-repository.ts'],
    rules: {
      'local/no-raw-sql-hot-read': 'off',
    },
  },
  // Exempt backup-repository from the hot-read rule.
  // backup-repository.ts accesses the settings table via SQL ONLY in bulk snapshot
  // (export: SELECT all rows) and bulk restore (import: DELETE + INSERT all rows).
  // These are not hot-state reads — they operate on the full dataset as part of an
  // explicit user-initiated backup/restore flow. The no-raw-sql-hot-read rule targets
  // consumer code that reads settings at call time instead of using the sync cache seam.
  // Bulk snapshot/restore is structurally distinct and intentional.
  {
    files: ['src/repositories/backup-repository.ts'],
    rules: {
      'local/no-raw-sql-hot-read': 'off',
    },
  },
  {
    // FULLY-authorised writers of BOTH mastery_level AND durable_events SQL.
    //
    // milestone-gate.ts — the sole atomic gate that pairs mastery-state writes
    //   with durable-event inserts in one exclusive tx (D2).
    //
    // backup-repository.ts — the user-initiated full-replace restore path.
    //   On import, it bulk-INSERTs progress rows (including mastery_level) AND
    //   durable_events in ONE exclusive transaction. This is the only legitimate
    //   restore path: the milestone gate already fired in the original session;
    //   we are replaying the persisted event log, not creating new milestone events.
    //   The restore pairs mastery state + durable events atomically (invariant holds
    //   on restore). This is a narrowly-scoped exemption: backup-repository.ts
    //   must never call recordMilestone or create net-new milestone events.
    //   It legitimately needs BOTH categories, hence a full waiver.
    //
    // progress-repository.ts and events-repository.ts are NOT exempt: their
    // private helpers have been moved into milestone-gate.ts, so any new
    // milestone-table SQL in those files should be flagged by the rule.
    files: [
      'src/repositories/milestone-gate.ts',
      'src/repositories/backup-repository.ts',
    ],
    rules: {
      'local/no-direct-milestone-mutation': 'off',
    },
  },
  {
    // graph-migration-repository.ts — the graph-versioning applier that reshapes
    //   progress rows during node split/merge/rename/deprecate. This is the
    //   graph-content axis (graphVersion), NOT the DB-schema axis (user_version).
    //   It uses MAX()-guarded SQL so mastery_level can never decrease (anti-shame).
    //   It does NOT emit durable events — it is a separate phase from the milestone
    //   gate, operating at the graph-versioning layer (DL-6).
    //
    // TARGETED exemption: this file may write progress.mastery_level directly, but
    // the durable_events guard REMAINS ACTIVE here. If anyone ever adds a
    // durable_events write to this module, the rule will (correctly) fire — graph
    // migrations must never emit durable events. (final-check Should-fix.)
    files: ['src/repositories/graph-migration-repository.ts'],
    rules: {
      'local/no-direct-milestone-mutation': ['error', { allow: ['mastery'] }],
    },
  },
  // Test files: disable react-hooks/rules-of-hooks (test helpers like useTestDb()
  // follow the 'use' prefix convention but are not React hooks).
  // Also disable no-require-imports for test files that must require() CJS modules
  // (the ESLint rule module and jest manual mocks have no ESM exports).
  // Also disable import/first: Jest test files must place jest.mock() calls before
  // ESM imports (Babel hoists jest.mock() but ESLint still flags them). The variable
  // declarations that prefix jest.mock() calls are intentionally before the imports.
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'jest.setup.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'import/first': 'off',
    },
  },
  {
    // Test files that legitimately use raw SQL against guarded tables for fixture
    // seeding or schema-shape verification:
    //   migrations.test.ts          — schema DDL verification (incl. SELECT FROM settings
    //                                 to verify the settings table exists and is writable)
    //   graph-migration.test.ts     — seeds progress rows with known mastery_level
    //                                 values to verify anti-shame propagation
    //   backup-repository.test.ts   — directly wipes tables (DELETE FROM durable_events,
    //                                 SELECT FROM settings) to set up atomic round-trip
    //                                 and failure-injection test scenarios
    //   eslint-rules.test.ts        — the RuleTester valid/invalid cases include SQL
    //                                 strings that are the tested patterns; they are
    //                                 string literals inside rule assertions, not live
    //                                 DB calls, but the rule sees them as violations.
    //                                 The test file must be fully exempt from both rules.
    files: [
      'src/db/__tests__/migrations.test.ts',
      'src/repositories/__tests__/graph-migration.test.ts',
      'src/repositories/__tests__/backup-repository.test.ts',
      'src/__tests__/eslint-rules.test.ts',
    ],
    rules: {
      'local/no-direct-milestone-mutation': 'off',
      'local/no-raw-sql-hot-read': 'off',
    },
  },
  {
    // eslint-rules-core.test.ts — the RuleTester valid/invalid cases include
    // number-formatting expressions (.toFixed, String(), Math.random) as the
    // tested patterns. They are literal code strings inside RuleTester assertions,
    // not live calls in production code, but the rule sees them as violations.
    // The test file must be fully exempt from no-adhoc-number-format.
    files: ['src/__tests__/eslint-rules-core.test.ts'],
    rules: {
      'local/no-adhoc-number-format': 'off',
    },
  },
  // Ignore generated / non-source paths.
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'ios/**',
      'android/**',
      'dist/**',
      'coverage/**',
    ],
  },
]);
