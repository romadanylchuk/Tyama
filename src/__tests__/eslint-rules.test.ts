/**
 * Meta-tests for the custom ESLint rules.
 *
 * Verifies that:
 *   (a) no-raw-sql-hot-read fires on planted violations (SELECT FROM settings in
 *       consumer code via RuleTester valid/invalid cases).
 *   (b) no-raw-sql-hot-read does NOT fire on the settings-repository filename
 *       (the rule itself skips the file when the filename ends with settings-repository.ts).
 *   (c) no-raw-sql-hot-read fires on a planted violation via direct rule invocation
 *       with a mock context pointing to a consumer file.
 *
 * NOTE: ESLint's RuleTester uses describe/it internally. When called at the top
 * level of a Jest test file (outside any it() block), it works correctly —
 * RuleTester.run() registers its own describe/it blocks that Jest picks up.
 */

// RuleTester from the eslint package (CJS module — require is appropriate here).
const { RuleTester } = require('eslint');
// Path: src/__tests__/ → root → eslint-rules/
const noRawSqlHotRead = require('../../eslint-rules/no-raw-sql-hot-read');

// ---------------------------------------------------------------------------
// (a) RuleTester: valid cases — should NOT fire
// ---------------------------------------------------------------------------

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  },
});

// Call ruleTester.run() at the top level so its internal describe/it blocks
// are registered at the correct scope (not nested inside another it() call).
ruleTester.run('no-raw-sql-hot-read', noRawSqlHotRead, {
  valid: [
    // NOT a hot read — INSERT is a write path, not a hot-state read
    { code: `const sql = 'INSERT INTO settings (key, value) VALUES (?, ?)';` },
    // NOT a hot read — DDL (CREATE TABLE)
    { code: `const sql = 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)';` },
    // NOT a hot read — different table entirely
    { code: `const sql = 'SELECT * FROM progress WHERE node_id = ?';` },
    // NOT a hot read — word "settings" appears but not in a FROM clause
    { code: `const description = 'update settings via the API';` },
    // NOT a hot read — DELETE is not a SELECT
    { code: `const sql = 'DELETE FROM settings WHERE key = ?';` },
  ],
  invalid: [
    // Planted violation: plain string literal with SELECT FROM settings → flagged
    {
      code: `db.getAllAsync('SELECT key, value FROM settings');`,
      errors: [{ messageId: 'noRawSqlHotRead' }],
    },
    // Planted violation: SELECT * FROM settings with WHERE clause → flagged
    {
      code: `const rows = db.getAllAsync('SELECT * FROM settings WHERE key = ?');`,
      errors: [{ messageId: 'noRawSqlHotRead' }],
    },
    // Planted violation: template literal → flagged
    {
      code: 'const sql = `SELECT key, value FROM settings`;',
      errors: [{ messageId: 'noRawSqlHotRead' }],
    },
    // Planted violation: lowercase SQL → flagged (case-insensitive)
    {
      code: `db.getFirstAsync('select * from settings');`,
      errors: [{ messageId: 'noRawSqlHotRead' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// (b) & (c) Direct invocation tests for the module-level filename exemption
// ---------------------------------------------------------------------------

describe('no-raw-sql-hot-read — filename exemption and direct invocation', () => {
  it('returns an empty visitor for files ending in settings-repository.ts', () => {
    // The rule skips files ending with settings-repository.ts at the module level
    // (before even inspecting nodes). An empty visitor {} means no checking at all.
    const mockContext = {
      filename: '/src/repositories/settings-repository.ts',
      getFilename: () => '/src/repositories/settings-repository.ts',
      report: jest.fn(),
    };

    const visitors = noRawSqlHotRead.create(mockContext);
    expect(Object.keys(visitors).length).toBe(0);
  });

  it('fires on a planted violation in a consumer file (direct invocation)', () => {
    // Mock context pointing to a consumer file (NOT settings-repository.ts)
    const mockContext = {
      filename: '/src/components/SomePage.ts',
      getFilename: () => '/src/components/SomePage.ts',
      report: jest.fn(),
    };

    const visitors = noRawSqlHotRead.create(mockContext);

    // The Literal visitor should be present
    expect(typeof visitors.Literal).toBe('function');

    // Simulate a Literal node containing a SELECT FROM settings SQL string
    const node = {
      type: 'Literal',
      value: 'SELECT key, value FROM settings WHERE key = ?',
    };

    visitors.Literal(node);

    // The rule should have reported one violation
    expect(mockContext.report).toHaveBeenCalledTimes(1);
    expect(mockContext.report).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'noRawSqlHotRead' })
    );
  });

  it('does NOT report on a Literal that is not a SELECT FROM settings', () => {
    const mockContext = {
      filename: '/src/something/other.ts',
      getFilename: () => '/src/something/other.ts',
      report: jest.fn(),
    };

    const visitors = noRawSqlHotRead.create(mockContext);

    // Non-flagged SQL
    visitors.Literal?.({ type: 'Literal', value: 'INSERT INTO settings (key, value) VALUES (?, ?)' });
    visitors.Literal?.({ type: 'Literal', value: 'SELECT * FROM progress' });
    visitors.Literal?.({ type: 'Literal', value: 'update settings please' });

    expect(mockContext.report).not.toHaveBeenCalled();
  });
});
