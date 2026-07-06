/**
 * ESLint rule: no-direct-milestone-mutation
 *
 * Flags two categories of violations in files other than milestone-gate.ts:
 *
 * 1. SQL WRITES: any string-literal SQL that writes to:
 *    - the `progress` table's milestone column (mastery_level), OR
 *    - the `durable_events` table
 *
 * 2. IMPORT BYPASS: any import of the underscore-prefixed milestone helpers
 *    (_writeMilestoneState, _insertDurableEvent, _emitDurable) from any path.
 *    These helpers are module-local non-exported functions in milestone-gate.ts
 *    and therefore NOT importable — but this visitor provides belt-and-suspenders
 *    protection in case the architecture ever changes.
 *
 * The milestone gate (milestone-gate.ts) is the SOLE path that may mutate
 * materialized milestone state — making it structurally impossible to write
 * milestone state without atomically emitting its durable event.
 *
 * DETECTION STRATEGY (SQL writes):
 * The rule inspects string Literal nodes (and TemplateLiteral quasi strings)
 * for SQL patterns that signal a write to the guarded tables/columns:
 *
 *   For progress.mastery_level writes:
 *     - INSERT INTO progress ... (mastery_level in column list)
 *     - UPDATE progress SET ... mastery_level
 *     - UPDATE progress SET mastery_level
 *
 *   For durable_events writes:
 *     - INSERT INTO durable_events
 *     - INSERT OR REPLACE INTO durable_events
 *     - UPDATE durable_events
 *     - DELETE FROM durable_events   (also guarded — structural history)
 *
 * DETECTION STRATEGY (import bypass):
 * The rule inspects ImportDeclaration nodes and reports if any specifier
 * name matches the underscore-prefixed milestone helpers.
 *
 * EXEMPTION:
 *   The milestone-gate.ts module is exempt (see eslint.config.js override).
 *   Schema DDL files use CREATE TABLE/INDEX patterns — these do NOT match the
 *   write patterns above and are not flagged.
 *
 * DEFENCE-IN-DEPTH (this rule is layer 3 of 4):
 *   Layer 1 — Module privacy: _writeMilestoneState, _insertDurableEvent, _emitDurable
 *     are module-local non-exported functions in milestone-gate.ts. They cannot
 *     be imported by any other module.
 *   Layer 2 — Barrel guard: index.ts does not (and cannot) re-export private helpers
 *   Layer 3 — THIS RULE: catches SQL writes + import bypass attempts
 *   Layer 4 — Guardrail jest tests (both-or-neither rollback test)
 */

'use strict';

/**
 * The underscore-prefixed milestone helpers that must not be imported from outside
 * milestone-gate.ts. Even though they are not exported (so the import would fail at
 * runtime), this visitor provides a lint-time safety net.
 */
const GUARDED_IMPORTS = new Set([
  '_writeMilestoneState',
  '_insertDurableEvent',
  '_emitDurable',
]);

/**
 * Patterns that indicate a guarded write to the durable_events table.
 * Separated from the mastery patterns so callers can waive ONE category
 * without waiving the other (see the rule `allow` option).
 */
const DURABLE_PATTERNS = [
  // INSERT INTO durable_events (any variant)
  /insert\s+(or\s+\w+\s+)?into\s+durable_events/i,

  // UPDATE durable_events
  /update\s+durable_events/i,

  // DELETE FROM durable_events
  /delete\s+from\s+durable_events/i,
];

/**
 * Patterns that indicate a guarded write to progress.mastery_level.
 */
const MASTERY_PATTERNS = [
  // UPDATE progress SET ... mastery_level ...
  // Catches "UPDATE progress SET mastery_level" and
  //         "UPDATE progress SET foo = ?, mastery_level = ?"
  /update\s+progress\b[\s\S]*\bmastery_level\b/i,
];

/**
 * Secondary check for INSERT INTO progress + mastery_level.
 * We need BOTH conditions present in the same SQL string.
 */
function isProgressMasteryInsert(sql) {
  const lower = sql.toLowerCase();
  return (
    /insert\s+(or\s+\w+\s+)?into\s+progress\b/i.test(lower) &&
    /\bmastery_level\b/i.test(lower)
  );
}

/**
 * Normalise a SQL string for pattern matching:
 * - collapse runs of whitespace to a single space
 * - lowercase
 */
function normaliseSql(sql) {
  return sql.replace(/\s+/g, ' ').toLowerCase().trim();
}

/**
 * Classify a SQL string into the guarded category it violates.
 *
 * @param sql   The raw SQL string.
 * @returns 'durable' | 'mastery' | null
 *   'durable' — writes to the durable_events table
 *   'mastery' — writes progress.mastery_level (UPDATE or INSERT)
 *   null      — not a guarded write
 *
 * durable_events is checked first: it is the structural-history guard and is
 * never legitimately waived by data-reshaping callers.
 */
function classifyGuardedWrite(sql) {
  const norm = normaliseSql(sql);

  for (const pattern of DURABLE_PATTERNS) {
    if (pattern.test(norm)) {
      return 'durable';
    }
  }

  for (const pattern of MASTERY_PATTERNS) {
    if (pattern.test(norm)) {
      return 'mastery';
    }
  }
  if (isProgressMasteryInsert(norm)) {
    return 'mastery';
  }

  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct SQL mutation of milestone state (progress.mastery_level) ' +
        'or durable_events outside milestone-gate.ts, and disallow importing ' +
        'underscore-prefixed milestone helpers from outside milestone-gate.ts.',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          // Categories this file is permitted to write directly.
          //   'mastery' — waive ONLY the progress.mastery_level guard
          //   'durable' — waive ONLY the durable_events guard
          // Omit or empty array = guard everything (default).
          // This lets graph-migration-repository.ts (which reshapes mastery_level
          // via MAX guards but NEVER writes durable_events) waive just 'mastery'
          // while keeping the durable_events guard active.
          allow: {
            type: 'array',
            items: { enum: ['mastery', 'durable'] },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noDirectMilestoneMutation:
        'Direct milestone-state or durable_events writes are forbidden outside ' +
        'milestone-gate.ts. Use recordMilestone() — the sole atomic gate. ' +
        'SQL: {{sql}}',
      noMilestoneHelperImport:
        "'{{name}}' is a module-local helper in milestone-gate.ts and must not " +
        'be imported from outside that module. Use recordMilestone() instead.',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allowed = new Set(options.allow || []);

    /**
     * Check a string value extracted from the AST.
     * Reports a violation if it matches a guarded write pattern that is NOT
     * waived for this file via the `allow` option.
     */
    function checkSql(node, sql) {
      if (typeof sql !== 'string') return;
      const category = classifyGuardedWrite(sql);
      if (category && !allowed.has(category)) {
        context.report({
          node,
          messageId: 'noDirectMilestoneMutation',
          data: {
            sql: sql.length > 120 ? sql.slice(0, 120) + '…' : sql,
          },
        });
      }
    }

    return {
      // Plain string literals: 'INSERT INTO durable_events ...'
      Literal(node) {
        if (typeof node.value === 'string') {
          checkSql(node, node.value);
        }
      },

      // Template literals: `INSERT INTO durable_events ...`
      // We concatenate all quasi (non-expression) parts for pattern matching.
      TemplateLiteral(node) {
        const combined = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
        checkSql(node, combined);
      },

      // Import bypass: flag any import of the underscore-prefixed helpers.
      // These are module-local in milestone-gate.ts and not exported — this
      // visitor is belt-and-suspenders protection.
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          const importedName =
            specifier.type === 'ImportSpecifier'
              ? (specifier.imported && specifier.imported.name)
              : null;
          if (importedName && GUARDED_IMPORTS.has(importedName)) {
            context.report({
              node: specifier,
              messageId: 'noMilestoneHelperImport',
              data: { name: importedName },
            });
          }
        }
      },
    };
  },
};
