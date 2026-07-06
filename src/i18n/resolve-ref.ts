/**
 * resolve-ref.ts — Pure LocalizedRef → display string resolution.
 *
 * PURE: no React, no settings reads, no side effects. All dependencies are
 * injected so this module is trivially unit-testable without a mounted
 * component tree.
 *
 * TWO PUBLIC FUNCTIONS:
 *
 *   resolveRef(ref, t, register?)
 *     Resolves a LocalizedRef to a display string using the injected `t`
 *     function. When `register` is supplied, it is passed as the i18next
 *     `context` option so the `_warm` / `_neutral` suffix is selected.
 *     If no register is supplied, the bare key is looked up (no context).
 *
 *   formatParseHint(error, t, register?)
 *     Dispatches on ParseError.kind to select the 'parse.<kind>' i18n key,
 *     then resolves it via resolveRef. Returns the formatted hint string.
 *     Never throws — unknown kinds fall back to 'parse.not-a-number'.
 *
 * LANGUAGE-NEUTRAL CORE INVARIANT:
 *   The domain core never calls these functions. LocalizedRef values flow
 *   from the core into the presentation layer; resolution happens here only.
 */

import type { LocalizedRef } from '@/core/types';
import type { ParseError, ParseErrorKind } from '@/parsing/parse-error';
import type { Register } from './catalog-types';

// ---------------------------------------------------------------------------
// TFunction — the injected i18next translation function shape
// ---------------------------------------------------------------------------

/**
 * The shape of the `t` function injected into resolve-ref helpers.
 *
 * Compatible with the i18next `t` function. Typed narrowly to what this
 * module needs: key lookup with optional interpolation vars + context.
 */
export type TFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

// ---------------------------------------------------------------------------
// resolveRef — core LocalizedRef resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a `LocalizedRef` to a display string.
 *
 * @param ref      — The language-neutral reference emitted by the domain core.
 * @param t        — The injected i18next translation function.
 * @param register — Optional register for context-suffix selection ('warm'|'neutral').
 *                   When provided, i18next resolves 'key_warm' → 'key_neutral' → 'key'.
 *                   When absent, the bare key is resolved (no context suffix).
 * @returns The resolved display string.
 *
 * PURE: no React, no module state reads, deterministic given the same args.
 */
export function resolveRef(
  ref: LocalizedRef,
  t: TFunction,
  register?: Register,
): string {
  const options: Record<string, unknown> = {};
  if (ref.vars) {
    Object.assign(options, ref.vars);
  }
  if (register !== undefined) {
    options.context = register;
  }
  return t(ref.key, Object.keys(options).length > 0 ? options : undefined);
}

// ---------------------------------------------------------------------------
// formatParseHint — ParseError.kind → display hint string
// ---------------------------------------------------------------------------

/**
 * Map from ParseErrorKind to the i18n key prefix used for format hints.
 * All keys resolve via the 'parse.*' namespace (no-shame-critical).
 */
const PARSE_HINT_KEYS: Record<ParseErrorKind, string> = {
  empty: 'parse.empty',
  'unrecognized-glyph': 'parse.unrecognized-glyph',
  malformed: 'parse.malformed',
  'doubled-separator': 'parse.doubled-separator',
  'multiple-decimals': 'parse.multiple-decimals',
  'not-a-number': 'parse.not-a-number',
};

/**
 * Format a ParseError into a calm, locale-aware format-hint string.
 *
 * @param error    — The ParseError returned by parseLocaleNumber().
 * @param t        — The injected i18next translation function.
 * @param register — Optional register for warm/neutral variant selection.
 * @returns A calm display string explaining the format issue.
 *          NEVER throws. Unknown kinds fall back to 'parse.not-a-number'.
 *
 * PURE: no React, no module state reads, deterministic given the same args.
 *
 * ANTI-SHAME INVARIANT:
 *   Format hints are gentle guidance, never a "wrong answer" verdict.
 *   The strings in the catalog use positive framing ("here's the format")
 *   rather than negative framing ("invalid input"). This is enforced by the
 *   catalog-completeness gate which checks no-shame-critical keys.
 */
export function formatParseHint(
  error: ParseError,
  t: TFunction,
  register?: Register,
): string {
  // Look up the key for this error kind. Fall back to 'not-a-number' for safety.
  const key = PARSE_HINT_KEYS[error.kind] ?? 'parse.not-a-number';
  return resolveRef({ key }, t, register);
}
