/**
 * Meta-tests for the no-adhoc-number-format ESLint rule.
 *
 * Verifies that:
 *   (a) The rule fires on planted violations:
 *       - .toFixed()
 *       - .toLocaleString()
 *       - .toPrecision()
 *       - String(n)
 *       - Math.random()
 *   (b) The rule does NOT fire on legitimate patterns:
 *       - Plain arithmetic
 *       - String literals (not number coercions)
 *       - Import statements
 *       - canonicalize() calls (the approved path)
 *   (c) Direct invocation confirms the rule fires on a mock consumer file.
 *
 * NOTE: This test file is exempt from local/no-adhoc-number-format via
 * eslint.config.js (the RuleTester cases contain the flagged patterns as
 * literal code strings inside assertions, not live formatting calls).
 */

// RuleTester from the eslint package (CJS module — require is appropriate here).
const { RuleTester } = require('eslint');
// Path: src/__tests__/ → root → eslint-rules/
const noAdhocNumberFormat = require('../../eslint-rules/no-adhoc-number-format');

// ---------------------------------------------------------------------------
// RuleTester: valid cases — should NOT fire
// ---------------------------------------------------------------------------

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  },
});

ruleTester.run('no-adhoc-number-format', noAdhocNumberFormat, {
  valid: [
    // Plain arithmetic — not a formatting call
    { code: `const result = 3 + 4;` },
    // String literal — no number coercion
    { code: `const msg = 'hello world';` },
    // canonicalize() call — the approved path
    { code: `const s = canonicalize(value);` },
    // Math.abs, Math.floor, Math.ceil — not Math.random
    { code: `const n = Math.abs(-5);` },
    { code: `const n = Math.floor(3.7);` },
    { code: `const n = Math.ceil(2.1);` },
    // String concatenation of non-number literals
    { code: `const s = 'value: ' + someVar;` },
    // Array.toString() — not a number formatting call (rule targets member
    // expressions but the valid cases should show arithmetic is fine)
    { code: `const x = arr.length;` },
    // Template literal (no number formatting call inside)
    { code: 'const s = `result: ${n}`;' },
  ],
  invalid: [
    // .toFixed() — explicit precision formatting
    {
      code: `const s = x.toFixed(2);`,
      errors: [{ messageId: 'noAdhocNumberFormat' }],
    },
    // .toFixed() on a numeric literal
    {
      code: `const s = (3.14159).toFixed(2);`,
      errors: [{ messageId: 'noAdhocNumberFormat' }],
    },
    // .toLocaleString() — locale-aware formatting
    {
      code: `const s = value.toLocaleString();`,
      errors: [{ messageId: 'noAdhocNumberFormat' }],
    },
    // .toLocaleString() with locale argument
    {
      code: `const s = num.toLocaleString('uk-UA');`,
      errors: [{ messageId: 'noAdhocNumberFormat' }],
    },
    // .toPrecision() — significant-figure formatting
    {
      code: `const s = n.toPrecision(5);`,
      errors: [{ messageId: 'noAdhocNumberFormat' }],
    },
    // String(n) — number coercion
    {
      code: `const s = String(n);`,
      errors: [{ messageId: 'noAdhocNumberFormat' }],
    },
    // String(42) — numeric literal coercion
    {
      code: `const s = String(42);`,
      errors: [{ messageId: 'noAdhocNumberFormat' }],
    },
    // Math.random() — non-deterministic; must use SeededRng
    {
      code: `const r = Math.random();`,
      errors: [{ messageId: 'noMathRandom' }],
    },
    // Math.random used as callback (no call)
    {
      code: `const fn = Math.random;`,
      errors: [{ messageId: 'noMathRandom' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// Direct invocation tests
// ---------------------------------------------------------------------------

describe('no-adhoc-number-format — direct invocation', () => {
  function makeContext(filename: string) {
    return {
      filename,
      getFilename: () => filename,
      report: jest.fn(),
      options: [],
    };
  }

  it('fires on .toFixed() in a core consumer file', () => {
    const ctx = makeContext('/src/core/generators/my-generator.ts');
    const visitors = noAdhocNumberFormat.create(ctx);

    // Simulate: x.toFixed(2)
    // AST: CallExpression { callee: MemberExpression { object: Identifier{x}, property: Identifier{toFixed} } }
    const node = {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'x' },
        property: { type: 'Identifier', name: 'toFixed' },
      },
      arguments: [{ type: 'Literal', value: 2 }],
    };

    visitors.CallExpression(node);
    expect(ctx.report).toHaveBeenCalledTimes(1);
    expect(ctx.report).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'noAdhocNumberFormat' })
    );
  });

  it('fires on Math.random in a core consumer file', () => {
    const ctx = makeContext('/src/core/generators/my-generator.ts');
    const visitors = noAdhocNumberFormat.create(ctx);

    // Simulate: Math.random (MemberExpression without call)
    const node = {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'Math' },
      property: { type: 'Identifier', name: 'random' },
    };

    visitors.MemberExpression(node);
    expect(ctx.report).toHaveBeenCalledTimes(1);
    expect(ctx.report).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'noMathRandom' })
    );
  });

  it('fires on String() in a core consumer file', () => {
    const ctx = makeContext('/src/core/generators/my-generator.ts');
    const visitors = noAdhocNumberFormat.create(ctx);

    // Simulate: String(n)
    const node = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'String' },
      arguments: [{ type: 'Identifier', name: 'n' }],
    };

    visitors.CallExpression(node);
    expect(ctx.report).toHaveBeenCalledTimes(1);
    expect(ctx.report).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'noAdhocNumberFormat' })
    );
  });

  it('does NOT fire on plain arithmetic in a core consumer file', () => {
    const ctx = makeContext('/src/core/generators/my-generator.ts');
    const visitors = noAdhocNumberFormat.create(ctx);

    // Simulate: canonicalize(value)  — not a member expression
    const callNode = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'canonicalize' },
      arguments: [{ type: 'Identifier', name: 'value' }],
    };

    visitors.CallExpression(callNode);
    expect(ctx.report).not.toHaveBeenCalled();
  });

  it('does NOT fire on Math.floor (only Math.random is flagged)', () => {
    const ctx = makeContext('/src/core/generators/my-generator.ts');
    const visitors = noAdhocNumberFormat.create(ctx);

    const node = {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'Math' },
      property: { type: 'Identifier', name: 'floor' },
    };

    visitors.MemberExpression(node);
    expect(ctx.report).not.toHaveBeenCalled();
  });
});
