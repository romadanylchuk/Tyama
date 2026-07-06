/**
 * ThemeProvider.tsx — hand-rolled React-context persona/theme seam (Stage 06,
 * Phase 2).
 *
 * NO STYLING LIBRARY (DL-D):
 *   Plain `React.createContext`. A styling library could slot in later behind
 *   the identical `useTheme()` interface — this file is the whole seam.
 *
 * PERSONA vs SCHEME — TWO ORTHOGONAL AXES:
 *   - `persona` (`adult-16+ | kid | enthusiast`) selects a `PersonaBundle`
 *     (color/type/space/motion + `register`) from `settings.get('persona')`.
 *   - `scheme` (`'light' | 'dark'`) is read independently from RN
 *     `useColorScheme()` — a system-level axis, NEVER derived from persona.
 *   `tokens = PERSONA_BUNDLES[persona][scheme]`.
 *
 * REGISTER → I18N SEAM:
 *   On mount and on every persona change, this provider calls
 *   `setI18nRegister(bundle.register)` so `useT()` (a thin reader in
 *   `src/i18n`) resolves the correct `_warm`/`_neutral` string variant. This
 *   is a ONE-WAY push (theme → i18n module-level state) specifically to
 *   avoid a hard import cycle: `src/i18n/useT.ts` never imports this module.
 *
 * setPersona MUST NOT TOUCH DIFFICULTY/PROGRESS/ENTRY-POINT (R1 / locked
 * decision #12): this file imports ONLY `settings` (persistence) and the
 * i18n register setter. It does not import, and must never import, anything
 * from `@/core/mastery`, `@/core/routing`, `@/repositories/progress-repository`,
 * or any other write path for difficulty/progress/entry-point state.
 * `ThemeProvider.test.tsx` asserts this by spying on those modules and
 * proving zero calls across a persona change.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { settings } from '@/repositories/settings-repository';
import { setI18nRegister } from '@/i18n/i18n';
import type { Register } from '@/i18n/catalog-types';
import { PERSONA_BUNDLES, resolvePersona, type Persona, type ThemeTokens } from './tokens';

// ---------------------------------------------------------------------------
// Context value contract
// ---------------------------------------------------------------------------

export interface ThemeContextValue {
  /** The resolved token bundle for the active persona × color scheme. */
  tokens: ThemeTokens;
  /** The i18next register the active persona resolves copy under. */
  register: Register;
  /** The active color scheme — orthogonal to persona. */
  scheme: 'light' | 'dark';
  /** The active persona. */
  persona: Persona;
  /**
   * Change the active persona. Persists `settings.persona` and re-derives
   * tokens/register only — touches NO difficulty/progress/entry-point state.
   */
  setPersona: (persona: Persona) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// ThemeProvider
// ---------------------------------------------------------------------------

export interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps): React.JSX.Element {
  // Scheme: orthogonal system axis. RN's useColorScheme() may return null
  // (unknown) — default to 'light' rather than leaving scheme undefined.
  const rawScheme = useColorScheme();
  const scheme: 'light' | 'dark' = rawScheme === 'dark' ? 'dark' : 'light';

  // Persona: seeded synchronously from the settings cache (settings.get()
  // is a synchronous cache-backed read — safe to call at first render since
  // App.tsx awaits settings.hydrate() before mounting the shell).
  const [persona, setPersonaState] = useState<Persona>(() => resolvePersona(settings.get('persona')));

  const bundle = PERSONA_BUNDLES[persona];
  const tokens = scheme === 'dark' ? bundle.dark : bundle.light;
  const register = bundle.register;

  // Push the register into the i18n module on mount and on every persona
  // (hence register) change. See file header — this is the one-way seam
  // that keeps useT() a thin reader with no import of this module.
  useEffect(() => {
    setI18nRegister(register);
  }, [register]);

  const setPersona = useCallback((next: Persona): void => {
    setPersonaState(next);
    // Fire-and-forget persistence: the in-memory settings cache updates
    // synchronously inside settings.set(), so the NEXT settings.get('persona')
    // call already reflects `next` even before the DB write resolves.
    void settings.set('persona', next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ tokens, register, scheme, persona, setPersona }),
    [tokens, register, scheme, persona, setPersona]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ---------------------------------------------------------------------------
// useTheme hook
// ---------------------------------------------------------------------------

/**
 * Read the active theme context. MUST be called within a `<ThemeProvider>`
 * — throws a clear developer error otherwise (a programmer-error guard, not
 * a user-facing surface, so this is not an anti-shame concern).
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme() must be called within a <ThemeProvider>.');
  }
  return ctx;
}
