/**
 * resolve-ref.test.ts
 *
 * Tests for resolveRef() and formatParseHint() in src/i18n/resolve-ref.ts.
 *
 * These functions are PURE — all dependencies are injected. We test them
 * with a minimal stub TFunction that records calls, so no i18next instance
 * needs to be initialized for these unit tests.
 */

import { resolveRef, formatParseHint } from '../resolve-ref';
import type { TFunction } from '../resolve-ref';
import type { LocalizedRef } from '@/core/types';
import type { ParseErrorKind } from '@/parsing/parse-error';

// ---------------------------------------------------------------------------
// Stub TFunction
// ---------------------------------------------------------------------------

/**
 * A stub `t` function that echoes back the key with any context suffix appended,
 * plus interpolated vars in the format `[key_ctx][var=val]`.
 * This is enough to verify that resolveRef() passes the right key + options.
 */
function makeStubT(): TFunction {
  return (key: string, options?: Record<string, unknown>): string => {
    let result = key;
    if (options?.context) {
      result += `_${options.context}`;
    }
    const vars = Object.entries(options ?? {}).filter(([k]) => k !== 'context');
    for (const [k, v] of vars) {
      result += `[${k}=${v}]`;
    }
    return result;
  };
}

// ---------------------------------------------------------------------------
// resolveRef tests
// ---------------------------------------------------------------------------

describe('resolveRef', () => {
  const t = makeStubT();

  it('resolves a bare key with no vars and no register', () => {
    const ref: LocalizedRef = { key: 'nav.nodeMap' };
    expect(resolveRef(ref, t)).toBe('nav.nodeMap');
  });

  it('resolves a key with vars (no register)', () => {
    const ref: LocalizedRef = { key: 'error.firmUpFirst', vars: { node: 'Addition' } };
    expect(resolveRef(ref, t)).toBe('error.firmUpFirst[node=Addition]');
  });

  it('resolves a key with register (adds context suffix)', () => {
    const ref: LocalizedRef = { key: 'error.notYet' };
    expect(resolveRef(ref, t, 'warm')).toBe('error.notYet_warm');
  });

  it('resolves a key with register neutral', () => {
    const ref: LocalizedRef = { key: 'error.notYet' };
    expect(resolveRef(ref, t, 'neutral')).toBe('error.notYet_neutral');
  });

  it('resolves a key with both vars and register', () => {
    const ref: LocalizedRef = { key: 'descent.body', vars: { node: 'Fraction simplification' } };
    expect(resolveRef(ref, t, 'warm')).toBe('descent.body_warm[node=Fraction simplification]');
  });

  it('does not add context when register is undefined', () => {
    const ref: LocalizedRef = { key: 'ring.mastered' };
    const result = resolveRef(ref, t, undefined);
    // Should NOT contain '_warm' or '_neutral'
    expect(result).toBe('ring.mastered');
  });

  it('passes numeric var values unchanged', () => {
    const ref: LocalizedRef = { key: 'streak.kept', vars: { count: 7 } };
    expect(resolveRef(ref, t)).toBe('streak.kept[count=7]');
  });
});

// ---------------------------------------------------------------------------
// formatParseHint tests — one for each ParseErrorKind
// ---------------------------------------------------------------------------

describe('formatParseHint', () => {
  const t = makeStubT();

  const cases: ParseErrorKind[] = [
    'empty',
    'unrecognized-glyph',
    'malformed',
    'doubled-separator',
    'multiple-decimals',
    'not-a-number',
  ];

  it.each(cases)('dispatches kind "%s" to parse.%s key', (kind) => {
    const error = { kind, rawInput: '???' };
    const result = formatParseHint(error, t);
    expect(result).toBe(`parse.${kind}`);
  });

  it('appends warm context when register is "warm"', () => {
    const error = { kind: 'empty' as ParseErrorKind, rawInput: '' };
    expect(formatParseHint(error, t, 'warm')).toBe('parse.empty_warm');
  });

  it('appends neutral context when register is "neutral"', () => {
    const error = { kind: 'malformed' as ParseErrorKind, rawInput: 'xyz' };
    expect(formatParseHint(error, t, 'neutral')).toBe('parse.malformed_neutral');
  });

  it('resolves every ParseErrorKind without throwing', () => {
    for (const kind of cases) {
      expect(() => {
        formatParseHint({ kind, rawInput: 'test' }, t, 'warm');
      }).not.toThrow();
    }
  });
});
