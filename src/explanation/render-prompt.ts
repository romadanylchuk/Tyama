/**
 * render-prompt.ts — Pure, deterministic prompt assembly (Stage 06, Phase 3).
 *
 * PURE: no React, no i18n singleton reads, no clock, no randomness, no LLM call.
 * Same `(ctx, template, resolveLocalizedRef)` in → byte-identical string out.
 *
 * LOCALIZEDREF RESOLUTION (implementation-shape decision):
 *   `ExplanationRequestContext.problem`/`Step.prompt` are `LocalizedRef`s (the
 *   language-neutral core never emits strings). Fully resolving them to natural
 *   language requires a live i18next catalog bound to `contentLanguage` — a
 *   concern this module deliberately does NOT own (that would couple the
 *   `src/explanation` seam to `src/i18n` internals and is out of Phase 3's file
 *   list). Instead this module accepts an INJECTABLE `resolveLocalizedRef`
 *   function (mirroring the injected-`t` pattern already used by
 *   `src/i18n/resolve-ref.ts`), defaulting to a structural fallback that turns
 *   the ref's `key` into a readable label and appends its `vars` as `name=value`
 *   pairs. This keeps the module dependency-free and fully deterministic while
 *   leaving room for a future caller (e.g. the Phase-6 session controller, which
 *   has a live `contentLanguage`-bound resolver in hand) to inject real
 *   catalog-resolved text without any change to this function's contract.
 *
 * ANTI-SHAME / PRIVACY:
 *   Only math-shaped fields are ever rendered (problem, steps, answers, method).
 *   The correct answer is placed AFTER the steps/problem — never as the lead —
 *   and its section label itself carries the "don't just reveal it" instruction.
 */

import type { LocalizedRef } from '@/core/types';
import type { ExplanationRequestContext } from './explanation-types';
import type { PromptTemplate } from './prompt-templates';

// ---------------------------------------------------------------------------
// LocalizedRefResolver — injectable resolution seam
// ---------------------------------------------------------------------------

/** A function that turns a language-neutral `LocalizedRef` into display text. */
export type LocalizedRefResolver = (ref: LocalizedRef) => string;

/**
 * Structural fallback resolver: no catalog lookup, no i18n dependency.
 * Turns `key` (e.g. `'fruit_eq.prompt'`) into a readable label (`'fruit eq prompt'`)
 * and appends any `vars` as `name=value` pairs. Deterministic given the same ref.
 */
function defaultResolveLocalizedRef(ref: LocalizedRef): string {
  const label = ref.key.replace(/[._-]+/g, ' ').trim();
  if (!ref.vars || Object.keys(ref.vars).length === 0) {
    return label;
  }
  const varsText = Object.entries(ref.vars)
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');
  return `${label} (${varsText})`;
}

/** Resolves the `method` field, which may be a plain string or a `LocalizedRef`. */
function resolveMethodLabel(
  method: LocalizedRef | string,
  resolve: LocalizedRefResolver,
): string {
  return typeof method === 'string' ? method : resolve(method);
}

// ---------------------------------------------------------------------------
// renderPrompt — deterministic assembly
// ---------------------------------------------------------------------------

/**
 * Deterministically assemble the full explanation prompt text from the
 * template and the math-only fields of `ctx`.
 *
 * @param ctx                 — The pinned escalation context.
 * @param template            — The resolved `PromptTemplate` (see `resolvePromptTemplate`).
 * @param resolveLocalizedRef — Optional injected resolver for `LocalizedRef` fields.
 *                              Defaults to a structural, dependency-free fallback.
 * @returns The assembled prompt text, ready to copy to the clipboard.
 *
 * PURE: no I/O, no LLM, no randomness, no clock. Identical arguments always
 * produce an identical string.
 */
export function renderPrompt(
  ctx: ExplanationRequestContext,
  template: PromptTemplate,
  resolveLocalizedRef: LocalizedRefResolver = defaultResolveLocalizedRef,
): string {
  const lines: string[] = [];

  lines.push(template.intro);
  lines.push('');
  lines.push(template.instructionMeta);
  lines.push('');

  lines.push(`${template.sectionLabels.problem}: ${resolveLocalizedRef(ctx.problem.prompt)}`);
  lines.push('');

  lines.push(`${template.sectionLabels.steps}:`);
  ctx.steps.forEach((step, index) => {
    const isFailedStep = index === ctx.failedStep.stepIndex;
    const marker = isFailedStep ? `  ${template.sectionLabels.failedStep}` : '';
    lines.push(`${index + 1}. ${resolveLocalizedRef(step.prompt)} — ${step.expected}${marker}`);
  });
  lines.push('');

  lines.push(`${template.sectionLabels.method}: ${resolveMethodLabel(ctx.method, resolveLocalizedRef)}`);
  lines.push(`${template.sectionLabels.studentAnswer}: ${ctx.studentAnswer}`);
  lines.push(`${template.sectionLabels.correctAnswer}: ${ctx.correctAnswer}`);

  if (ctx.priorApproach) {
    lines.push('');
    lines.push(template.differentModality);
  }

  lines.push('');
  lines.push(template.closing.replace('{{language}}', ctx.explanationLanguage));

  return lines.join('\n');
}
