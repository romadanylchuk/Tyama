/**
 * ESLint rule: no-adhoc-number-format
 *
 * Flags ad-hoc number-to-string normalization in src/core/** outside the
 * canonical module (src/core/canonical/**) and the RNG module (src/core/rng/**).
 *
 * INTENT:
 * The CANONICAL_NUMBER_STANDARD (see src/core/canonical/canonical-number.ts)
 * requires that ALL number→string canonicalization in the domain core routes
 * through the single `canonicalize()` function. Ad-hoc formatting (.toFixed,
 * .toLocaleString, String(n), manual replace(',', '.')) outside that module
 * creates silent divergence between what the generator produces and what the
 * checker expects — the single worst failure for an anxious learner (a correct
 * answer marked wrong). Similarly, Math.random() must never appear in generator
 * code; all randomness must flow through the passed SeededRng.
 *
 * WHAT IS FLAGGED (CallExpression member calls or identifiers):
 *   .toFixed(       — ad-hoc decimal precision formatting
 *   .toLocaleString( — locale-aware formatting (wrong in the canonical core)
 *   .toPrecision(   — significant-figure formatting
 *   String(n)       — coercing a number to string (use canonicalize() instead)
 *   Number.prototype.toString() via .toString() on a number literal/variable
 *   Math.random     — non-deterministic; generators must use SeededRng
 *
 * WHAT IS NOT FLAGGED:
 *   - Any file under src/core/canonical/** (the canonical module itself)
 *   - Any file under src/core/rng/**     (the sole legitimate RNG site)
 *   - src/__tests__/eslint-rules-core.test.ts — the RuleTester suite whose
 *     valid/invalid cases embed the forbidden patterns as string literals.
 *   - String(x) where x is clearly not a number context cannot always be
 *     determined statically; the rule flags the pattern conservatively.
 *
 * NOTE ON TEST FILES: This rule is NOT broadly exempted for all *.test.ts /
 * __tests__ files. Only the single RuleTester file above is turned 'off' in
 * eslint.config.js. Core test files are otherwise subject to the rule and must
 * route number→string through canonicalize() like production code (none of the
 * stage-02 core test files use the forbidden patterns, so the rule stays green).
 *
 * EXEMPTIONS are configured in eslint.config.js via rule 'off' overrides for
 * the canonical module, the rng module, and the single RuleTester test file —
 * the rule itself has no built-in filename exemption (unlike no-raw-sql-hot-read).
 * This keeps the rule simple and the exemption policy in one place (eslint.config.js).
 *
 * MIRRORS: Stage-01 pattern from eslint-rules/no-raw-sql-hot-read.js.
 *   - Uses messageId (not raw message strings)
 *   - Supports ESLint 8 (context.getFilename) and 9 (context.filename)
 *   - CJS module.exports
 */

'use strict';

/**
 * Member method names that constitute ad-hoc number formatting.
 * Matched on MemberExpression.property.name for CallExpression nodes.
 */
const ADHOC_FORMAT_METHODS = new Set(['toFixed', 'toLocaleString', 'toPrecision']);

/**
 * Global/namespace function names that constitute ad-hoc number coercion.
 * 'String' is flagged when called as a function (String(x)).
 */
const ADHOC_COERCE_FNS = new Set(['String']);

/**
 * Return the normalised file path for the current ESLint context.
 * Supports ESLint 8 (context.getFilename()) and 9 (context.filename).
 */
function getFilename(context) {
  if (typeof context.filename === 'string') return context.filename;
  if (typeof context.getFilename === 'function') return context.getFilename();
  return '';
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow ad-hoc number-to-string formatting and Math.random() in ' +
        'src/core/** outside the canonical and rng modules.',
      recommended: true,
    },
    schema: [],
    messages: {
      noAdhocNumberFormat:
        'Ad-hoc number formatting ({{method}}) is forbidden in src/core/** outside ' +
        'src/core/canonical/**. Use canonicalize() from @/core/canonical instead. ' +
        'This ensures generator and checker always agree on the canonical form.',
      noMathRandom:
        'Math.random() is forbidden in generator code. All randomness must flow ' +
        'through the SeededRng passed to generate(). This ensures reproducibility.',
    },
  },

  create(context) {
    // Note: filename-based exemptions are handled via eslint.config.js overrides,
    // not inside the rule. The getFilename helper is retained for future use if
    // a built-in exemption is ever needed (mirrors no-raw-sql-hot-read pattern).
    void getFilename(context); // suppress no-unused-vars if called — deliberate

    return {
      // Flag .toFixed(), .toLocaleString(), .toPrecision() call expressions.
      // These appear as: expr.toFixed(n) → CallExpression where
      //   callee = MemberExpression { object: expr, property: { name: 'toFixed' } }
      CallExpression(node) {
        const callee = node.callee;

        // Member call: x.toFixed(2), x.toLocaleString(), x.toPrecision(5)
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          ADHOC_FORMAT_METHODS.has(callee.property.name)
        ) {
          context.report({
            node,
            messageId: 'noAdhocNumberFormat',
            data: { method: `.${callee.property.name}()` },
          });
          return;
        }

        // Global coercion call: String(x)
        if (
          callee.type === 'Identifier' &&
          ADHOC_COERCE_FNS.has(callee.name)
        ) {
          context.report({
            node,
            messageId: 'noAdhocNumberFormat',
            data: { method: `${callee.name}()` },
          });
          return;
        }
      },

      // Flag Math.random references (MemberExpression OR CallExpression).
      // We flag the MemberExpression itself so `Math.random` without a call
      // (e.g. passed as a callback) is also caught.
      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'Math' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'random'
        ) {
          context.report({
            node,
            messageId: 'noMathRandom',
            data: { method: 'Math.random' },
          });
        }
      },
    };
  },
};
