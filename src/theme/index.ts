/**
 * src/theme/index.ts — Public barrel for the theme/persona module.
 *
 * Re-exports:
 *   - Token contracts + config-as-data bundles (tokens.ts)
 *   - Anti-shame error-feedback visual spec (anti-shame-tokens.ts)
 *   - The ThemeProvider seam (ThemeProvider.tsx)
 */

// Token contracts + persona bundle config
export type { Persona, ColorTokens, TypeTokens, SpaceTokens, MotionTokens, ThemeTokens, PersonaBundle } from './tokens';
export { PERSONAS, PERSONA_BUNDLES, resolvePersona } from './tokens';

// Anti-shame error-feedback visual spec
export type { AntiShameFeedbackTokens } from './anti-shame-tokens';
export {
  ANTI_SHAME_FEEDBACK_LIGHT,
  ANTI_SHAME_FEEDBACK_DARK,
  resolveAntiShameFeedback,
  FORBIDDEN_FEEDBACK_VOCAB,
  containsForbiddenVocab,
  isDominantRedHex,
} from './anti-shame-tokens';

// ThemeProvider seam
export type { ThemeContextValue, ThemeProviderProps } from './ThemeProvider';
export { ThemeProvider, useTheme } from './ThemeProvider';
