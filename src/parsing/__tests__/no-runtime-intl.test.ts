/**
 * no-runtime-intl.test.ts -- Structural guard: NO runtime source path
 * references a live `Intl` API (Stage 07, Phase 7 -- "locale-decimal
 * exhaustion matrix + no-runtime-Intl assertion").
 *
 * WHY THIS GUARD EXISTS:
 *   Hermes (the React Native JS engine used by Expo) ships without full ICU;
 *   `Intl.NumberFormat().formatToParts` is platform-variable on Android. Its
 *   failure mode is the single worst class for this product: a CORRECT
 *   answer silently marked wrong for an anxious learner. `LOCALE_NUMERIC_TABLE`
 *   (src/parsing/locale-table.ts) exists specifically to eliminate that
 *   variance by freezing the separator rules as config-as-data instead of
 *   deriving them from the runtime `Intl` API.
 *
 *   `Intl` legitimately appears TWICE in this repository:
 *     1. As PROSE in doc comments (locale-table.ts, parse-locale-number.ts,
 *        parsing/index.ts, motivation/streak-xp.ts) explaining WHY Intl is
 *        avoided -- e.g. "Intl.NumberFormat.formatToParts is platform-variable
 *        on Android". These are comments, not code.
 *     2. As an actual DEVELOPER-ONLY cross-check inside
 *        `src/parsing/__tests__/locale-table.test.ts`, which calls
 *        `Intl.NumberFormat` at test time (skipped gracefully in ICU-less CI)
 *        to verify the frozen table agrees with ICU where ICU is available.
 *
 *   Both are sanctioned. What must NEVER happen is a *runtime code path*
 *   (outside `__tests__`) that actually CALLS `Intl.*` or constructs
 *   `new Intl.NumberFormat(...)`.
 *
 * WHY AN AST WALK, NOT A TEXT/REGEX SCAN:
 *   A plain substring or regex scan cannot distinguish "the identifier `Intl`
 *   used in live code" from "the four letters I-n-t-l appearing inside a
 *   comment that explains why the code does NOT use Intl". This repository's
 *   own runtime doc comments literally contain the substring "Intl.NumberFormat"
 *   as prose (locale-table.ts's header) -- a naive text scan would flag the
 *   very file that documents the anti-Intl design decision, a false positive
 *   on day one. Doc comments are TypeScript "trivia", never part of the AST;
 *   an AST walk that only visits real syntax nodes (identifiers, property
 *   accesses) structurally cannot see comment text at all, so this problem
 *   disappears by construction -- mirroring exactly how
 *   `src/__tests__/anti-shame-guard.test.ts` solves the analogous
 *   "red" vs "rendered"/comment-negation problem for FORBIDDEN_FEEDBACK_VOCAB.
 *
 * WHAT THIS GUARDS:
 *   Every `.ts`/`.tsx` file under `src/**`, excluding any `__tests__/**`
 *   directory and `.d.ts` files, is parsed with the TypeScript compiler API
 *   and walked for any IDENTIFIER node whose text is exactly `Intl` (the
 *   global namespace/value). If a runtime path reintroduces
 *   `Intl.NumberFormat`/`toLocaleString`/any other live `Intl.*` reference,
 *   this test fails immediately, citing the file and line.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// findIntlIdentifierUsages -- the scanning primitive (pure: source text in,
// { line, snippet } offenses out). Only real Identifier AST nodes are
// visited; doc comments and JSDoc are TypeScript trivia and are never part
// of this walk.
// ---------------------------------------------------------------------------

export interface IntlUsageOffense {
  readonly line: number;
  readonly snippet: string;
}

export function findIntlIdentifierUsages(sourceText: string, fileName: string): IntlUsageOffense[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const offenses: IntlUsageOffense[] = [];

  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === 'Intl') {
      const lineStart = sourceFile.getLineStarts()[lineOf(node) - 1];
      const lineEnd = sourceText.indexOf('\n', lineStart);
      const lineText = sourceText.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      offenses.push({ line: lineOf(node), snippet: lineText.slice(0, 160) });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return offenses;
}

// ---------------------------------------------------------------------------
// Scanner self-check -- in-memory fixtures ONLY, never real source
// ---------------------------------------------------------------------------

describe('findIntlIdentifierUsages() -- scanner self-check (in-memory fixtures only)', () => {
  it('flags `Intl.NumberFormat(...)` (a live property-access call)', () => {
    const offenses = findIntlIdentifierUsages("const nf = Intl.NumberFormat('en');", 'fixture.ts');
    expect(offenses.length).toBeGreaterThan(0);
  });

  it('flags `new Intl.NumberFormat(...)` (a live constructor call)', () => {
    const offenses = findIntlIdentifierUsages("const nf = new Intl.NumberFormat('en');", 'fixture.ts');
    expect(offenses.length).toBeGreaterThan(0);
  });

  it('flags a bare `typeof Intl` runtime check', () => {
    const offenses = findIntlIdentifierUsages("if (typeof Intl !== 'undefined') {}", 'fixture.ts');
    expect(offenses.length).toBeGreaterThan(0);
  });

  it('does NOT flag "Intl" appearing inside a single-line comment', () => {
    const offenses = findIntlIdentifierUsages(
      '// This table is NOT derived from Intl at runtime. Never falls back to Intl.',
      'fixture.ts'
    );
    expect(offenses).toEqual([]);
  });

  it('does NOT flag "Intl.NumberFormat.formatToParts" appearing inside a JSDoc block comment (the real locale-table.ts prose shape)', () => {
    const offenses = findIntlIdentifierUsages(
      '/**\n * WHY NOT Intl?\n *   Intl.NumberFormat.formatToParts is platform-variable on Android.\n */\nexport const x = 1;',
      'fixture.ts'
    );
    expect(offenses).toEqual([]);
  });

  it('does NOT flag "Intl" appearing inside an ordinary string literal (documentation-as-data, not a live reference)', () => {
    const offenses = findIntlIdentifierUsages('const note = "never uses Intl at runtime";', 'fixture.ts');
    expect(offenses).toEqual([]);
  });

  it('does NOT flag an unrelated identifier that merely contains "Intl" as a substring (e.g. a hypothetical `IntlUtils`)', () => {
    const offenses = findIntlIdentifierUsages('const IntlUtils = {};', 'fixture.ts');
    expect(offenses).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The binding gate -- scan every shipped runtime source file under src/**
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');

function collectRuntimeFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.endsWith('.d.ts')
      ) {
        results.push(full);
      }
    }
  }

  walk(rootDir);
  return results;
}

const RUNTIME_FILES = collectRuntimeFiles(SRC_ROOT);

describe('structural: no runtime src/** path references a live Intl API (Hermes/Android-ICU risk mitigation)', () => {
  it('is wired to a non-trivial number of shipped source files (guard-of-the-guard: not accidentally scanning zero files)', () => {
    expect(RUNTIME_FILES.length).toBeGreaterThanOrEqual(30);
  });

  it('includes the src/parsing runtime files known to discuss Intl in prose (proves the scan is not accidentally skipping the exact files most at risk)', () => {
    const relPaths = RUNTIME_FILES.map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, '/'));
    expect(relPaths).toContain('src/parsing/locale-table.ts');
    expect(relPaths).toContain('src/parsing/parse-locale-number.ts');
  });

  it.each(RUNTIME_FILES.map((f) => [path.relative(REPO_ROOT, f), f] as const))(
    '%s contains no live Intl identifier reference (Intl.<member>, `new Intl`, `typeof Intl`, …)',
    (_relPath, filePath) => {
      const sourceText = fs.readFileSync(filePath, 'utf8');
      const offenses = findIntlIdentifierUsages(sourceText, filePath);
      if (offenses.length > 0) {
        console.error(`Runtime Intl reference found in ${filePath}:`, offenses);
      }
      expect(offenses).toEqual([]);
    }
  );
});
