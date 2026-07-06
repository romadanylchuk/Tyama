/**
 * i18n.ts — i18next initialization for Tyama.
 *
 * INITIALIZATION CONTRACT:
 *   i18n is initialized synchronously on module load (initReactI18next is NOT
 *   used here — we use a thin custom hook in useT.ts instead, to avoid
 *   a hard import cycle with the theme provider).
 *
 * LANGUAGE SELECTION:
 *   1. Explicit override: `settings.get('uiLanguage')` (after hydrate).
 *   2. Device detection: `getLocales()[0].languageCode` from expo-localization
 *      (first-run seed, before the user has set a preference).
 *   3. Final fallback: 'uk' (Ukrainian — the MVP primary locale).
 *
 * This module exposes:
 *   - `i18n`          — the configured i18next instance (default export).
 *   - `initI18n(lang)` — call after `settings.hydrate()` to set the resolved
 *                        language from settings + device detection.
 *   - `setI18nRegister(register)` — called by ThemeProvider on mount/persona
 *                        change to push the active register so useT() reads it.
 *   - `getI18nRegister()` — pure reader for the current register.
 *
 * REGISTER SEAM:
 *   The register value ('warm' | 'neutral') is supplied by the ThemeProvider
 *   (phase 2) and injected here. Before ThemeProvider mounts, the register
 *   defaults to 'neutral'. useT() reads it via getI18nRegister().
 *
 * CONTEXT SUFFIX:
 *   i18next uses 'context' as a key-suffix selector:
 *     t('error.notYet', { context: 'warm' }) → looks up 'error.notYet_warm',
 *     falls back to 'error.notYet_neutral', then 'error.notYet'.
 *   Separation character is '_' (the default; set explicitly below).
 *
 * TWO VERSION AXES / LANGUAGE-NEUTRAL CORE:
 *   i18n lives entirely in the presentation layer. The domain core never reads
 *   this module; it emits LocalizedRef values only.
 */

import { createInstance } from 'i18next';
import { getLocales } from 'expo-localization';
import type { Register } from './catalog-types';
import uk from './locales/uk';
import en from './locales/en';

// ---------------------------------------------------------------------------
// Register state — pushed by ThemeProvider (phase 2)
// ---------------------------------------------------------------------------

let _currentRegister: Register = 'neutral';

/**
 * Set the active register. Called by ThemeProvider on mount and persona change.
 * Phase 1 default is 'neutral'; phase 2 wires the real value from useTheme().
 */
export function setI18nRegister(register: Register): void {
  _currentRegister = register;
}

/**
 * Read the current register. Called by useT() when building the context arg.
 */
export function getI18nRegister(): Register {
  return _currentRegister;
}

// ---------------------------------------------------------------------------
// i18next instance — synchronous initialization
// ---------------------------------------------------------------------------

/**
 * The configured i18next instance. Initialized synchronously on module load
 * so it is always ready before any component tree mounts.
 *
 * `initImmediate: false` ensures synchronous initialization in the Node/Jest
 * environment (no async backend, resources are bundled).
 */
const i18n = createInstance();

// Perform initial synchronous init with the 'uk' default.
// The resolved language is set via initI18n() after settings.hydrate().
void i18n.init({
  lng: 'uk',
  fallbackLng: 'uk',
  // Disable i18next's default missing-key warnings in production; keep in dev.
  // We rely on the completeness gate rather than runtime warnings.
  debug: false,
  resources: {
    uk: { translation: uk },
    en: { translation: en },
  },
  // Use the default 'translation' namespace.
  ns: ['translation'],
  defaultNS: 'translation',
  // The context suffix separator: 'error.notYet' + '_' + 'warm' → 'error.notYet_warm'.
  contextSeparator: '_',
  // Don't escape HTML — we're in React Native, not a web browser.
  interpolation: {
    escapeValue: false,
  },
  // Synchronous init — required for Jest and for the initial render before
  // initI18n() is called.
  initImmediate: false,
});

// ---------------------------------------------------------------------------
// initI18n — call after settings.hydrate() to set the resolved language
// ---------------------------------------------------------------------------

/**
 * Resolve and apply the UI language after settings are hydrated.
 *
 * Priority:
 *   1. `lang` argument (from settings.get('uiLanguage')).
 *   2. Device language from expo-localization (first-run seed; used when
 *      settings returns the bare default 'uk' AND the device says something
 *      else — but MVP defaults to 'uk' anyway).
 *   3. 'uk' final fallback.
 *
 * Call this once in the App.tsx init chain, after settings.hydrate().
 * Subsequent language changes (from a user picker) should call
 * i18n.changeLanguage(tag) directly.
 *
 * @param lang — BCP-47 tag from settings.get('uiLanguage'). May be the
 *               default 'uk' on first run.
 */
export async function initI18n(lang: string): Promise<void> {
  // Determine the best language to use.
  let resolved = lang;
  if (!resolved || resolved === '') {
    // No stored preference — use device locale as first-run seed.
    const locales = getLocales();
    const deviceTag = locales[0]?.languageCode ?? 'uk';
    resolved = deviceTag;
  }
  // Ensure the resolved language is one we support; fall back to 'uk'.
  const supported = ['uk', 'en'];
  if (!supported.includes(resolved)) {
    resolved = 'uk';
  }
  await i18n.changeLanguage(resolved);
}

export default i18n;
