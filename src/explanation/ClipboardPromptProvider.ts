/**
 * ClipboardPromptProvider.ts — The MVP `ExplanationProvider` implementation.
 *
 * Renders a deterministic prompt from `render-prompt.ts` + the resolved
 * `PromptTemplate` (`resolvePromptTemplate`), then copies it to the OS clipboard
 * via `expo-clipboard`. Fully offline: NO LLM call happens here or anywhere in
 * this module — the "prompt" is static template text plus math-only context,
 * intended to be pasted by the learner into their own chat app.
 *
 * ANTI-SHAME / CALM FAILURE:
 *   Clipboard unavailability or a copy failure is never surfaced as an error/red
 *   state. `explain()` NEVER throws — any failure degrades to
 *   `{ status: 'copy-failed' }` so the UI can show a neutral, calm retry
 *   affordance (Phase 6 concern; this module only guarantees the calm result
 *   shape).
 *
 * FUTURE `ApiExplanationProvider`:
 *   Will implement the SAME `ExplanationProvider` interface, consuming the
 *   IDENTICAL `ExplanationRequestContext`. Only the transport changes.
 */

import * as Clipboard from 'expo-clipboard';
import type {
  ExplanationProvider,
  ExplanationRequestContext,
  ExplanationResult,
} from './explanation-types';
import { resolvePromptTemplate } from './prompt-templates';
import { renderPrompt } from './render-prompt';

export class ClipboardPromptProvider implements ExplanationProvider {
  /**
   * Render the deterministic prompt for `ctx` and attempt to copy it to the
   * clipboard. Never throws.
   *
   * @param ctx — The pinned escalation context.
   * @returns `{ kind: 'clipboard', promptText, status }` — `status` is
   *          `'copied'` on success, `'copy-failed'` when the clipboard is
   *          unavailable or the copy attempt fails.
   */
  async explain(ctx: ExplanationRequestContext): Promise<ExplanationResult> {
    const template = resolvePromptTemplate(ctx.explanationLanguage);
    const promptText = renderPrompt(ctx, template);

    // NOTE: expo-clipboard (SDK 56 / v7) exposes no `isAvailableAsync` guard —
    // that API does not exist on this package (the plan's "guarded by
    // isAvailableAsync where applicable" is not applicable here). On iOS/Android
    // setStringAsync's returned promise "always resolves to true"; on web it
    // reflects whether the browser granted clipboard permission. Both signals
    // (a false resolution, or a thrown/rejected promise) degrade calmly here.
    try {
      const saved = await Clipboard.setStringAsync(promptText);
      return {
        kind: 'clipboard',
        promptText,
        status: saved === false ? 'copy-failed' : 'copied',
      };
    } catch {
      // Calm degradation — never throw, never a shame/error surface.
      return { kind: 'clipboard', promptText, status: 'copy-failed' };
    }
  }
}
