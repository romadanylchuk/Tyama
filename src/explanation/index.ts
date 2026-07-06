/**
 * index.ts — Public barrel for the @/explanation module (Stage 06, Phase 3).
 *
 * Single import surface for the `ExplanationProvider` seam: contracts,
 * the config-as-data prompt-template asset, the pure render function, and the
 * MVP `ClipboardPromptProvider`.
 */

export type {
  ExplanationProvider,
  ExplanationRequestContext,
  ExplanationResult,
} from './explanation-types';

export type {
  PromptTemplate,
  PromptTemplateSectionLabels,
} from './prompt-templates';
export { PROMPT_TEMPLATES, resolvePromptTemplate } from './prompt-templates';

export type { LocalizedRefResolver } from './render-prompt';
export { renderPrompt } from './render-prompt';

export { ClipboardPromptProvider } from './ClipboardPromptProvider';
