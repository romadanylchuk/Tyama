/**
 * anti-shame-guard.test.ts — repo-wide STRUCTURAL anti-shame guard
 * (Stage 06, Phase 7).
 *
 * WHAT THIS GUARDS:
 *   Every `.ts`/`.tsx` file under the stage-06 UI source trees (`src/i18n`,
 *   `src/theme`, `src/explanation`, `src/motivation`, `src/navigation`,
 *   `src/ui`) — excluding test files — is parsed with the TypeScript compiler
 *   API and walked for STRING LITERALS, TEMPLATE LITERAL SEGMENTS, and JSX
 *   TEXT NODES ONLY. Each is checked against `FORBIDDEN_FEEDBACK_VOCAB`
 *   (word-boundary, case-insensitive) and, for hex-color-shaped literals,
 *   against `isDominantRedHex()` — the SAME two Phase-2 primitives
 *   `src/theme/anti-shame-tokens.ts` ships and `anti-shame-tokens.test.ts`
 *   already exercises. This test is the repo-wide enforcement of the single
 *   anti-shame invariant: no wrong/red/✗/buzzer/shake/locked/padlock/
 *   penalty/subtracted/deducted surface may ever reach the learner.
 *
 * WHY AN AST WALK, NOT A TEXT GREP:
 *   A raw substring grep over whole files has two failure modes a real
 *   catalog/theme source tree hits immediately:
 *     1. False positives from ordinary English words that CONTAIN "red" as a
 *        bare substring — "rendered", "registered", "prepared", "shared" —
 *        all appear legitimately in this codebase's comments/strings. A
 *        naive substring check would flag `src/navigation/curated-path.ts`'s
 *        "...has no registered generator." violation message on day one.
 *     2. False negatives/positives from scanning comments — the plan's own
 *        documented exemption ("comments that negate a forbidden word, e.g.
 *        'never locked', are intentional") only makes sense if comments are
 *        excluded from the scan in the first place. Since a TS AST's
 *        StringLiteral/JsxText nodes never include comment trivia, and an
 *        Identifier node (`FailedStep`, `failedStep`) is never a literal
 *        node, both problems disappear structurally — no separate
 *        comment-stripping or negation-detection logic is needed.
 *   `findForbiddenSurfaces()` below is the pure scanning primitive; the
 *   "scanner self-check" describe block proves it behaves correctly against
 *   in-memory fixtures (including the exact false-positive words named
 *   above), so a future accidental change to the scanning logic itself can
 *   never silently turn this guard into a no-op. The final describe block
 *   then runs it against every real file in the shipped source tree — THAT
 *   is the binding gate: it fails the moment a forbidden UI surface is
 *   introduced anywhere in stage-06 source.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { FORBIDDEN_FEEDBACK_VOCAB, isDominantRedHex } from '@/theme';

// ---------------------------------------------------------------------------
// findForbiddenSurfaces — the scanning primitive (pure: source text in, offenses out)
// ---------------------------------------------------------------------------

export interface ForbiddenSurfaceOffense {
  readonly kind: 'vocab' | 'red-hex';
  readonly detail: string;
  readonly line: number;
  readonly snippet: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One matcher per `FORBIDDEN_FEEDBACK_VOCAB` entry. Alphabetic words get a
 * `\b` word-boundary match (case-insensitive) so "rendered"/"registered"/
 * "prepared" — which all contain the bare substring "red" — are correctly
 * NOT flagged, while a standalone "red" still is. The non-alphabetic glyph
 * ('✗') has no meaningful word boundary, so it is matched as a literal
 * substring instead.
 */
const WORD_MATCHERS: readonly { readonly word: string; readonly regex: RegExp }[] =
  FORBIDDEN_FEEDBACK_VOCAB.map((word) => ({
    word,
    regex: /^[a-zA-Z]+$/.test(word)
      ? new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i')
      : new RegExp(escapeRegExp(word)),
  }));

/** 3- or 6-digit hex color literal, e.g. `#f00` / `#ff0000`. */
const HEX_LITERAL_RE = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;

/**
 * Walks a TypeScript/TSX source's AST and returns every forbidden-vocabulary
 * or dominant-red-hex offense found ONLY inside string literals, template
 * literal segments, and JSX text nodes. Comments and identifiers/type names
 * are structurally invisible to this walk — see the file header.
 */
export function findForbiddenSurfaces(
  sourceText: string,
  fileName: string
): ForbiddenSurfaceOffense[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const offenses: ForbiddenSurfaceOffense[] = [];

  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }

  function checkText(text: string, node: ts.Node): void {
    for (const { word, regex } of WORD_MATCHERS) {
      if (regex.test(text)) {
        offenses.push({ kind: 'vocab', detail: word, line: lineOf(node), snippet: text.slice(0, 120) });
      }
    }
    for (const hex of text.match(HEX_LITERAL_RE) ?? []) {
      if (isDominantRedHex(hex)) {
        offenses.push({ kind: 'red-hex', detail: hex, line: lineOf(node), snippet: text.slice(0, 120) });
      }
    }
  }

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'FORBIDDEN_FEEDBACK_VOCAB'
    ) {
      // The config-as-data word list ITSELF (src/theme/anti-shame-tokens.ts).
      // It legitimately contains every forbidden word as DATA describing what
      // is forbidden — never as rendered UI copy. Already asserted complete
      // by anti-shame-tokens.test.ts. Skip only this declaration's own
      // subtree; everything else in the file (and every other file) is still
      // scanned normally.
      return;
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      checkText((node as unknown as ts.LiteralLikeNode).text, node);
    } else if (ts.isJsxText(node)) {
      checkText(node.text, node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return offenses;
}

// ---------------------------------------------------------------------------
// Scanner self-check — in-memory fixtures ONLY, never real source
// ---------------------------------------------------------------------------

describe('findForbiddenSurfaces() — scanner self-check (in-memory fixtures only)', () => {
  it('flags a forbidden word inside a string literal', () => {
    const offenses = findForbiddenSurfaces('const s = "This answer is wrong";', 'fixture.ts');
    expect(offenses.some((o) => o.kind === 'vocab' && o.detail === 'wrong')).toBe(true);
  });

  it('flags a forbidden word inside JSX text', () => {
    const offenses = findForbiddenSurfaces(
      'function C() { return <Text>Locked</Text>; }',
      'fixture.tsx'
    );
    expect(offenses.some((o) => o.kind === 'vocab' && o.detail === 'locked')).toBe(true);
  });

  it('flags a forbidden word inside a template literal segment', () => {
    const offenses = findForbiddenSurfaces('const s = `status: ${x} penalty`;', 'fixture.ts');
    expect(offenses.some((o) => o.kind === 'vocab' && o.detail === 'penalty')).toBe(true);
  });

  it('flags the ✗ glyph inside a string literal', () => {
    const offenses = findForbiddenSurfaces('const s = "✗ nope";', 'fixture.ts');
    expect(offenses.some((o) => o.kind === 'vocab' && o.detail === '✗')).toBe(true);
  });

  it('flags a dominant-red hex literal', () => {
    const offenses = findForbiddenSurfaces('const c = "#ff0000";', 'fixture.ts');
    expect(offenses.some((o) => o.kind === 'red-hex' && o.detail === '#ff0000')).toBe(true);
  });

  it('does NOT flag a muted/non-red hex literal', () => {
    const offenses = findForbiddenSurfaces('const c = "#3E7CB1";', 'fixture.ts');
    expect(offenses).toEqual([]);
  });

  it('does NOT flag a comment that negates a forbidden word (comments are not literal nodes)', () => {
    const offenses = findForbiddenSurfaces(
      '// never locked, never a padlock, never red\nconst s = "calm and fine";',
      'fixture.ts'
    );
    expect(offenses).toEqual([]);
  });

  it('does NOT flag a JSDoc block comment containing forbidden words', () => {
    const offenses = findForbiddenSurfaces(
      '/**\n * No red, no buzzer, no shake, no padlock, no penalty glyph.\n */\nconst s = "ok";',
      'fixture.ts'
    );
    expect(offenses).toEqual([]);
  });

  it('does NOT flag an identifier/type name (FailedStep/failedStep are not literals)', () => {
    const offenses = findForbiddenSurfaces(
      "interface FailedStep { failedStep: string }\nconst x: FailedStep = { failedStep: 'fruit-equations' };",
      'fixture.ts'
    );
    expect(offenses).toEqual([]);
  });

  it('does NOT flag whole-word-boundary false positives ("rendered"/"registered"/"prepared" all contain "red")', () => {
    const offenses = findForbiddenSurfaces(
      'const s = "Prepared and rendered; registered generator.";',
      'fixture.ts'
    );
    expect(offenses).toEqual([]);
  });

  it('DOES still flag "red" as a standalone word (proves the boundary match still catches the real word)', () => {
    const offenses = findForbiddenSurfaces('const s = "red alert";', 'fixture.ts');
    expect(offenses.some((o) => o.kind === 'vocab' && o.detail === 'red')).toBe(true);
  });

  it('exempts ONLY the FORBIDDEN_FEEDBACK_VOCAB declaration itself (the config-as-data word list), not any other array', () => {
    const exempt = findForbiddenSurfaces(
      "export const FORBIDDEN_FEEDBACK_VOCAB = ['wrong', 'red'];",
      'fixture.ts'
    );
    expect(exempt).toEqual([]);

    const notExempt = findForbiddenSurfaces("export const otherList = ['wrong', 'red'];", 'fixture.ts');
    expect(notExempt.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The binding gate — scan every shipped stage-06 source file
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');
const SOURCE_SUBDIRS = ['i18n', 'theme', 'explanation', 'motivation', 'navigation', 'ui'] as const;

function collectSourceFiles(rootDir: string): string[] {
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

const SOURCE_FILES = SOURCE_SUBDIRS.flatMap((d) => collectSourceFiles(path.join(SRC_ROOT, d)));

describe('repo-wide anti-shame structural guard (shipped stage-06 source)', () => {
  it('is wired to a non-trivial number of shipped source files (guard-of-the-guard: the scan is not accidentally scanning zero files)', () => {
    expect(SOURCE_FILES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(SOURCE_FILES.map((f) => [path.relative(REPO_ROOT, f), f] as const))(
    '%s contains no forbidden anti-shame vocabulary or dominant-red hex in a string/template/JSX literal',
    (_relPath, filePath) => {
      const sourceText = fs.readFileSync(filePath, 'utf8');
      const offenses = findForbiddenSurfaces(sourceText, filePath);
      if (offenses.length > 0) {
        console.error(`Anti-shame guard violation(s) in ${filePath}:`, offenses);
      }
      expect(offenses).toEqual([]);
    }
  );
});
