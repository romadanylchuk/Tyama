/**
 * explanation-types.ts — The ExplanationProvider seam contracts (Stage 06, Phase 3).
 *
 * WHY A NEW TYPE HERE (DL-A, feature-plan.md):
 *   Stage 04's `ExplanationContext` (src/core/routing/routing-types.ts) deliberately
 *   left `problem`/`studentAnswer`/`correctAnswer`/`method`/`steps`/`failedStep` as
 *   `unknown` (DL-5 there) so stage 06 could pin the concrete shapes WITHOUT forcing
 *   an edit to `route.ts` or risking a cross-stage contract churn. This module is
 *   that pin: `ExplanationRequestContext` is a NEW type, not a retyping-in-place of
 *   `ExplanationContext`. The session controller (Phase 6) builds one of these from
 *   the concrete `GeneratedTask`/`FailedStep`/`settings` values it already holds,
 *   splitting `ExplanationContext.language` into `contentLanguage`/`explanationLanguage`.
 *
 * TWO LANGUAGE FIELDS ONLY (no `uiLanguage`):
 *   `contentLanguage` — the language the ORIGINAL PROBLEM was presented in (the
 *     model needs this to read the problem correctly).
 *   `explanationLanguage` — the language the model's REPLY should be written in.
 *   UI chrome language is irrelevant to the explanation itself and is intentionally
 *   absent from this context (language-neutral core invariant: three independent
 *   language axes exist repo-wide, but only two of them are relevant here).
 *
 * FUTURE `ApiExplanationProvider` (out of scope, reserved):
 *   `ExplanationResult.kind` reserves `'inline'` for a future provider that calls a
 *   real LLM API and renders the explanation inline instead of via clipboard. It
 *   will consume the IDENTICAL `ExplanationRequestContext` — only the transport
 *   (`kind` + how `promptText`/a real response is obtained) changes. No LLM call is
 *   baked into the core or into this contract.
 *
 * ANTI-SHAME / PRIVACY:
 *   The context carries ONLY math (problem, steps, answers, skill node, prior
 *   routing metadata) — no personal data. Nothing leaves the device until the
 *   learner explicitly pastes the copied prompt into their own chat app.
 */

import type { LocalizedRef, NodeId, ProblemSpec, Step } from '@/core/types';
import type { FailedStep } from '@/checking';
import type { RoutingReason } from '@/core/routing';

// ---------------------------------------------------------------------------
// ExplanationRequestContext — the pinned concrete escalation hand-off shape
// ---------------------------------------------------------------------------

/**
 * The concrete context handed to `ExplanationProvider.explain()` on anti-loop
 * escalation (routing `reason === 'escalate'`).
 *
 * Built by the Phase-6 session controller from:
 *   - `task.problem`      → `problem`
 *   - the learner's raw input at the failed step → `studentAnswer`
 *   - `task.solution` (canonical) → `correctAnswer`
 *   - a method label (LocalizedRef when the generator provides one, otherwise a
 *     plain descriptive string) → `method`
 *   - `task.steps`         → `steps`
 *   - the `CheckResult['failedStep']` that triggered escalation → `failedStep`
 *   - the task's `skillNode`
 *   - `settings.get('contentLanguage')` / `settings.get('explanationLanguage')`
 *   - `RoutingDecision.antiLoop.explanationContext.priorApproach` (if present)
 */
export interface ExplanationRequestContext {
  /** The language-neutral problem statement the learner was working on. */
  readonly problem: ProblemSpec;
  /** The learner's raw answer text (as submitted, pre-canonicalization). */
  readonly studentAnswer: string;
  /** The canonical correct answer (never surfaced as the lead in the rendered prompt). */
  readonly correctAnswer: string;
  /** A label for the solution method — either a resolvable ref or a plain string. */
  readonly method: LocalizedRef | string;
  /** The ordered solution steps for the task. */
  readonly steps: readonly Step[];
  /** The first-break step that triggered this escalation. */
  readonly failedStep: FailedStep;
  /** The skill-graph node this problem exercised. */
  readonly skillNode: NodeId;
  /** BCP-47 tag: the language the ORIGINAL problem/steps text is written in. */
  readonly contentLanguage: string;
  /** BCP-47 tag: the language the explanation reply should be written in. */
  readonly explanationLanguage: string;
  /**
   * Present only when this escalation follows an anti-loop `'descend-further'`/
   * `'escalate'` decision. Documents what was already tried so the provider can
   * deliberately instruct a DIFFERENT modality/approach this time.
   */
  readonly priorApproach?: {
    readonly target: NodeId;
    readonly reason: RoutingReason;
  };
}

// ---------------------------------------------------------------------------
// ExplanationResult — structured (not void) so a future provider is additive
// ---------------------------------------------------------------------------

/**
 * The structured result of an `ExplanationProvider.explain()` call.
 *
 * Structured (never `void`) so a future `ApiExplanationProvider` can land as a
 * new `kind: 'inline'` value with no breaking change to this contract.
 */
export interface ExplanationResult {
  /**
   * `'clipboard'` — the MVP `ClipboardPromptProvider`: a prompt was rendered and
   *   (attempted to be) copied to the OS clipboard for the learner to paste.
   * `'inline'` — RESERVED for a future `ApiExplanationProvider` that renders a
   *   real model response directly in the UI. Not implemented in this stage.
   */
  readonly kind: 'clipboard' | 'inline';
  /** The deterministically-rendered prompt text (always present, even on failure). */
  readonly promptText: string;
  /**
   * `'copied'`      — the clipboard write succeeded.
   * `'copy-failed'` — the clipboard write failed or was unavailable; the UI must
   *   show a calm, neutral retry affordance (never a red/error surface).
   * `'ready'`       — reserved for a provider that only renders without copying
   *   (e.g. an inline provider that has nothing to copy).
   */
  readonly status: 'copied' | 'copy-failed' | 'ready';
}

// ---------------------------------------------------------------------------
// ExplanationProvider — the seam interface
// ---------------------------------------------------------------------------

/**
 * The `ExplanationProvider` seam. The MVP `ClipboardPromptProvider` is the sole
 * implementation shipped in this stage. A future `ApiExplanationProvider` must
 * implement the SAME interface, consuming the IDENTICAL `ExplanationRequestContext`
 * — only the transport (how `explain()` produces its result) changes.
 */
export interface ExplanationProvider {
  explain(ctx: ExplanationRequestContext): Promise<ExplanationResult>;
}
