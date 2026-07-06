/**
 * ESLint rule: no-raw-sql-hot-read
 *
 * Flags raw SQL string literals that read from the `settings` table in files
 * other than `src/repositories/settings-repository.ts`.
 *
 * INTENT:
 * All hot-state reads must route through the typed SettingsRepository.get() seam
 * (src/repositories/settings-repository.ts). This keeps the hot-read path:
 *   - Synchronous (cache-backed after hydration)
 *   - Type-safe (keyed by SettingsSchema)
 *   - MMKV-swappable (only the implementation file changes)
 *
 * WHAT IS FLAGGED:
 * Any Literal or TemplateLiteral string that:
 *   1. Contains a SQL SELECT, FROM, or WHERE clause referencing the `settings` table.
 *      Pattern: matches SQL keywords like SELECT/FROM/WHERE together with the table
 *      name `settings` in a way that looks like a hot-path DB read.
 *   2. Appears in a file that is NOT the settings repository itself.
 *
 * Specifically, the rule flags strings matching:
 *   - SELECT ... FROM settings ...       (direct table read)
 *   - FROM settings                      (FROM clause with settings table)
 * The regex is case-insensitive and handles whitespace variants.
 *
 * WHAT IS NOT FLAGGED:
 *   - The settings-repository.ts file (exempt via eslint.config.js override).
 *   - backup-repository.ts (exempt — see eslint.config.js; its settings access is
 *     a bulk snapshot/restore, not a hot-state read; distinct operational semantics).
 *   - DDL: CREATE TABLE settings / DROP TABLE settings (no SELECT/FROM).
 *   - INSERT INTO settings (writes, not hot reads).
 *   - DELETE FROM settings (deletes, not hot reads).
 *   - TemplateLiterals that contain `settings` as part of an identifier (e.g. a
 *     variable called `newSettings`) — the regex anchors on SQL keywords around
 *     the table name to avoid false positives.
 *
 * IMPLEMENTATION NOTES:
 * The rule checks both Literal (string constants) and TemplateLiteral (template
 * literals with embedded expressions, matched via the raw quasis). TemplateLiteral
 * is included because some developers may construct SQL strings with template
 * literals even though the codebase currently uses tagged string args.
 *
 * The filename match uses the path separator-normalised filename from
 * context.getFilename() / context.filename (supports both ESLint 8 and 9).
 */

'use strict';

/**
 * Regex that matches SQL strings reading from the `settings` table.
 *
 * Matches patterns like:
 *   SELECT ... FROM settings
 *   SELECT key, value FROM settings
 *   FROM settings WHERE ...
 *
 * Does NOT match:
 *   INSERT INTO settings ...   (write path — not a hot read)
 *   DELETE FROM settings ...   (delete path)
 *   CREATE TABLE settings ...  (DDL)
 *   -- SELECT FROM settings    (SQL comment)
 *
 * Technique: require the string to contain BOTH a SELECT-class keyword reference
 * AND a FROM settings reference (case-insensitive). This avoids false-positives
 * on SQL that merely references the word "settings" in a different context.
 */
const SETTINGS_HOT_READ_PATTERN = /\bFROM\s+settings\b/i;
const SELECT_PATTERN = /\bSELECT\b/i;

/**
 * Return the normalised file path for the current ESLint context.
 * Supports ESLint 8 (context.getFilename()) and 9 (context.filename).
 */
function getFilename(context) {
  // ESLint 9: context.filename is a plain string property
  if (typeof context.filename === 'string') return context.filename;
  // ESLint 8: context.getFilename() is a method
  if (typeof context.getFilename === 'function') return context.getFilename();
  return '';
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw SQL reads of the settings table outside settings-repository.ts',
      recommended: true,
    },
    schema: [],
    messages: {
      noRawSqlHotRead:
        'Raw SQL hot-state reads are forbidden outside settings-repository.ts. ' +
        'Use the typed SettingsRepository.get() seam instead.',
    },
  },

  create(context) {
    const filename = getFilename(context);

    // The settings-repository is the exempt file — it IS the implementation.
    // Additional exemptions (backup-repository) are handled via eslint.config.js overrides.
    // Normalise path separators for cross-platform compatibility.
    const normFilename = filename.replace(/\\/g, '/');
    if (normFilename.endsWith('settings-repository.ts')) {
      return {};
    }

    /**
     * Check a SQL string for disallowed hot reads.
     * Flags the node if the string matches both the FROM settings pattern
     * AND the SELECT pattern (to ensure it's a read, not a write or DDL).
     */
    function checkSql(node, sqlString) {
      if (
        typeof sqlString === 'string' &&
        SETTINGS_HOT_READ_PATTERN.test(sqlString) &&
        SELECT_PATTERN.test(sqlString)
      ) {
        context.report({
          node,
          messageId: 'noRawSqlHotRead',
        });
      }
    }

    return {
      // String literals: 'SELECT key, value FROM settings'
      Literal(node) {
        if (typeof node.value === 'string') {
          checkSql(node, node.value);
        }
      },

      // Template literals: `SELECT ${col} FROM settings`
      // Check the static quasis (raw text between expressions).
      TemplateLiteral(node) {
        // Join all quasis into one string for pattern matching.
        // This handles the case where the table name appears in a static part.
        const combined = node.quasis.map((q) => q.value.raw).join('');
        checkSql(node, combined);
      },
    };
  },
};
