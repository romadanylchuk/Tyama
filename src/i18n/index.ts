/**
 * src/i18n/index.ts — Public barrel for the i18n module.
 *
 * Re-exports the i18n public surface:
 *   - The configured i18next instance (default export from i18n.ts)
 *   - initI18n — call after settings.hydrate() to set the resolved language
 *   - setI18nRegister / getI18nRegister — ThemeProvider → register seam
 *   - resolveRef / formatParseHint — pure LocalizedRef resolution
 *   - useT — React hook returning a (LocalizedRef) → string resolver
 *   - findMissingRegisterVariants / formatViolation — completeness gate
 *   - Catalog type contracts (Register, REGISTERS, REGISTER_FALLBACK, etc.)
 *   - Criticality types and config (Criticality, CRITICAL_KEY_PREFIXES, keyCriticality)
 */

// i18next instance + language management
export { default as i18n, initI18n, setI18nRegister, getI18nRegister } from './i18n';

// Pure resolution helpers
export { resolveRef, formatParseHint } from './resolve-ref';
export type { TFunction } from './resolve-ref';

// React hook
export { useT } from './useT';

// Completeness gate (pure checker + formatter)
export { findMissingRegisterVariants, formatViolation } from './completeness';
export type { CatalogMap, CompletenessViolation } from './completeness';

// Catalog type contracts
export type { Register, LocaleTag, CatalogResource } from './catalog-types';
export { REGISTERS, REGISTER_FALLBACK, LOCALE_TAGS } from './catalog-types';

// Criticality config
export type { Criticality } from './criticality';
export { CRITICAL_KEY_PREFIXES, keyCriticality } from './criticality';

// Locale catalogs (for use by the completeness gate tests and CI script)
export { default as ukCatalog } from './locales/uk';
export { default as enCatalog } from './locales/en';
