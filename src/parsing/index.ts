/**
 * @/parsing barrel -- public surface of the locale numeric parsing module.
 *
 * This is the single import surface for all consumers (stage-03 checker,
 * stage-06 screen, tests).
 *
 * Exports:
 *   parseLocaleNumber    -- pure locale-aware string -> number normalizer
 *   ParseResult          -- { ok: true, value } | { ok: false, error: ParseError }
 *   ParseError           -- structured failure object (returned, never thrown)
 *   ParseErrorKind       -- closed union of failure reasons (stage-06 i18n dispatch key)
 *   LocaleNumericProfile -- frozen value object for one locale's number rules
 *   resolveLocaleProfile -- lookup with unknown -> 'uk' fallback (never Intl)
 *   LOCALE_NUMERIC_TABLE -- the frozen config-as-data table
 *
 * NOTE: makeParseError is intentionally NOT exported — it is a module-internal
 * factory. External code should not construct ParseError objects directly.
 */

export { parseLocaleNumber } from './parse-locale-number';
export type { ParseResult } from './parse-locale-number';

export type { ParseError } from './parse-error';
export type { ParseErrorKind } from './parse-error';

export type { LocaleNumericProfile } from './locale-table';
export { resolveLocaleProfile, LOCALE_NUMERIC_TABLE } from './locale-table';
