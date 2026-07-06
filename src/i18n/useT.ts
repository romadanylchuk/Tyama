/**
 * useT.ts — React hook for LocalizedRef resolution bound to the active i18n state.
 *
 * PHASE 2 STATUS — REAL WIRING LANDED:
 *   `<ThemeProvider>` (src/theme/ThemeProvider.tsx) now calls
 *   `setI18nRegister(bundle.register)` on mount and on every persona change,
 *   so `getI18nRegister()` below reflects the live persona-derived register
 *   (`'warm'` for `adult-16+`/`kid`, `'neutral'` for `enthusiast`) rather than
 *   the Phase-1 hardcoded `'neutral'` default. Before `<ThemeProvider>` mounts
 *   (or if a consumer calls `useT()` outside its tree), lookups still use the
 *   `'neutral'` module-level default set at `i18n.ts` load time — a safe
 *   degradation, never a crash.
 *
 * PHASE 4 FIX — BIND useTranslation TO OUR OWN i18n INSTANCE:
 *   `i18n.ts` deliberately does NOT call `i18n.use(initReactI18next)` (to
 *   avoid a hard import cycle) and this app never mounts an
 *   `<I18nextProvider>`. Without EITHER of those, react-i18next's
 *   `useTranslation()` has no way to discover our configured instance — it
 *   falls through to its "NO_I18NEXT_INSTANCE" branch, which returns a
 *   pass-through `t` that just echoes the raw key back (silently NEVER
 *   resolving any catalog string). This was a latent gap: no Phase 1–3 test
 *   ever rendered `useT()` inside an actual component tree (all Phase-1/2
 *   coverage exercises `resolveRef`/`i18n.t` directly), so it went
 *   undetected until Phase 4's `MasteryRing` became the first real
 *   `useT()`-in-JSX consumer. Fixed here by passing our already-imported
 *   `i18n` instance explicitly via `useTranslation(undefined, { i18n })` —
 *   `react-i18next` prioritizes an explicitly-passed instance over context
 *   or the global default, so this requires no Provider and no
 *   `initReactI18next`, matching the existing "thin custom hook, no context
 *   cycle" design intent exactly.
 *
 * USAGE:
 *   const t = useT();
 *   const label = t({ key: 'error.notYet' });
 *   const hint  = t({ key: 'parse.empty' });
 *   const body  = t({ key: 'descent.body', vars: { node: 'Number bonds' } });
 *
 * The returned function accepts a LocalizedRef and injects the current
 * register as the i18next context, so:
 *   - Warm-register persona → resolves 'error.notYet_warm'
 *   - Neutral-register persona → resolves 'error.notYet_neutral'
 *   Falls back to 'error.notYet' if neither variant exists.
 *
 * SEAM (deliberately NOT a React context read — avoids a hard import cycle):
 *   `useT` reads the register from `getI18nRegister()` (module-level state in
 *   `i18n.ts`), which `<ThemeProvider>` updates via `setI18nRegister()` on
 *   mount and persona change. `src/theme/ThemeProvider.tsx` imports
 *   `setI18nRegister` from `src/i18n/i18n.ts`; this file imports
 *   `getI18nRegister` from the SAME module. `useT.ts` never imports
 *   `src/theme` — that is what breaks the cycle. The register is read fresh
 *   on every call to the returned resolver function (not cached at hook-call
 *   time), so a lookup made after a persona change always reflects the new
 *   register even without a dedicated re-render path for register changes.
 */

import { useTranslation } from 'react-i18next';
import { resolveRef } from './resolve-ref';
import i18nInstance, { getI18nRegister } from './i18n';
import type { LocalizedRef } from '@/core/types';

// ---------------------------------------------------------------------------
// useT hook
// ---------------------------------------------------------------------------

/**
 * Returns a function that resolves a LocalizedRef to a display string,
 * bound to the currently active i18n language and register.
 *
 * @returns `(ref: LocalizedRef) => string` — the resolver function.
 *
 * Re-renders when the i18next language changes (useTranslation wires that).
 * Register changes (via setI18nRegister) do NOT trigger re-renders by default
 * in Phase 1 — Phase 2 will call forceUpdate or use a context value to
 * propagate register changes to components. The register is read freshly
 * on each call to the returned function, so the value is always current
 * for the next render that is triggered by any other state change.
 */
export function useT(): (ref: LocalizedRef) => string {
  const { t } = useTranslation(undefined, { i18n: i18nInstance });

  return (ref: LocalizedRef): string => {
    const register = getI18nRegister();
    return resolveRef(ref, t as (key: string, options?: Record<string, unknown>) => string, register);
  };
}
