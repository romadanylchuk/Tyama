/**
 * session-controller.ts — The task-screen orchestration unit (Stage 06, Phase 6).
 *
 * Realizes the session-layer contract every earlier stage brief left for this
 * phase to wire: `checkAnswer → ingestAttempt → applyScheduledReview → route`,
 * with a session-scoped `AntiLoopMemory` and `diagnosticDebt` set (never
 * persisted — discarded when the session ends / this instance is dropped).
 *
 * KEPT INJECTABLE / RN-FREE ON PURPOSE:
 *   No React import anywhere in this file. `SessionController` is a plain
 *   class over the stage-01..05 seams; `TaskScreen.tsx` is the only RN
 *   consumer. This keeps the orchestration unit-testable without a mounted
 *   component tree (per the plan's "kept mostly pure/injectable" note).
 *
 * STRUCTURED VIEW-EVENTS, NOT PRE-RENDERED STRINGS:
 *   `submit()` returns a `SessionViewEvent` — structured data only (a
 *   `ParseError`, a `RoutingReason` + `descentPath`, an `ExplanationResult`).
 *   `TaskScreen` resolves these to display text via `useT()`/`formatParseHint`
 *   under the active theme register. This module never imports `@/i18n` or
 *   `@/theme` (language-neutral core invariant extended into the session
 *   layer: no localized string is ever constructed here).
 *
 * ANTI-SHAME — NO VIEW-EVENT IS A SHAME SURFACE:
 *   - `'parse-hint'` is never a routing event (the `ParseError` structurally
 *     carries no `skillNode` — see @/checking) and never touches
 *     `ingestAttempt`/`route`.
 *   - `'staged-descent'` frames every non-escalate routing reason
 *     (`'symptom-is-target' | 'deepest-unmastered' | 'probe' | 'descend-further'`)
 *     as a calm forward reroute ("let's firm up X first"), never a penalty.
 *   - `'escalation'` hands off to the `ExplanationProvider` and reports its
 *     calm `status` (`'copied'` or a neutral `'copy-failed'` retry) — never an
 *     error/red surface.
 *   - `'correct'` never renders a "you were wrong before" framing; XP is
 *     purely additive.
 *
 * DIAGNOSTIC-DEBT LIFECYCLE (session-scoped, in-memory only):
 *   A routing decision whose `target !== failedStep.skillNode` is a genuine
 *   reroute AWAY from what the learner was working on — added to
 *   `diagnosticDebt` so `@/navigation`'s `whereToNext` can prioritize it next.
 *   `'symptom-is-target'` (target === entry) is NOT added — there is no
 *   different topic to owe; the learner just needs another attempt at the
 *   SAME node. Debt for a node is cleared the moment a `'correct'` outcome is
 *   ingested for that node.
 *
 * ANTI-LOOP RECORDING ORDER (matches @/core/routing/route.ts's own contract):
 *   `route()` only READS `AntiLoopMemory` (typed `ReadonlyAntiLoopMemory` at
 *   its call boundary) — the session layer is responsible for writing to it
 *   AFTER acting on the returned `RoutingDecision`. This controller records
 *   the visit immediately after `route()` returns, before branching on
 *   escalation, so a subsequent `route()` call in the SAME session sees the
 *   updated visit count regardless of which branch fires.
 */

import type {
  DiagnosticPayload,
  FailedStep,
  ParseError,
} from '@/checking';
import { checkAnswer } from '@/checking';
import type { GeneratedTask, GraphDefinition, NodeId } from '@/core/types';
import {
  DEFAULT_MASTERY_CONFIG,
  resolveMasteryConfig,
} from '@/core/mastery/mastery-config';
import { parseMasteryMetrics, type MasteryMetrics } from '@/core/mastery/mastery-metrics';
import { makeMasteryLookup } from '@/core/mastery/mastery-lookup';
import { ingestAttempt } from '@/core/mastery/ingest-attempt';
import {
  createAntiLoopMemory,
  route,
  type AntiLoopMemory,
  type MasteryLookup,
  type RoutingReason,
} from '@/core/routing';
import { applyScheduledReview } from '@/core/spaced-repetition';
import { getProgress } from '@/repositories/progress-repository';
import {
  ClipboardPromptProvider,
  type ExplanationProvider,
  type ExplanationRequestContext,
  type ExplanationResult,
} from '@/explanation';
import {
  MIN_TASKS_FOR_KEPT_DAY,
  awardTaskCompletionXp,
  recordKeptDaySession,
} from '@/motivation';
import type { LocaleNumericProfile } from '@/parsing';
import type { WidgetOutput } from '@/widgets';

// ---------------------------------------------------------------------------
// SessionViewEvent — structured, never a shame surface
// ---------------------------------------------------------------------------

export type SessionViewEvent =
  | { readonly kind: 'correct'; readonly xpAwarded: number }
  | { readonly kind: 'parse-hint'; readonly error: ParseError }
  | {
      readonly kind: 'staged-descent';
      readonly descentPath: readonly NodeId[];
      readonly reason: RoutingReason;
      readonly target: NodeId;
      readonly diagnostic?: DiagnosticPayload;
    }
  | { readonly kind: 'escalation'; readonly result: ExplanationResult; readonly target: NodeId };

// ---------------------------------------------------------------------------
// SubmitInput
// ---------------------------------------------------------------------------

export interface SubmitInput {
  /** The task the learner was just presented (steps + skillNode + problem). */
  readonly task: GeneratedTask;
  /** The learner's WidgetOutput(s), positionally aligned to `task.steps`. */
  readonly outputs: readonly WidgetOutput[];
  /** The active locale numeric profile (from `resolveLocaleProfile(contentLanguage)`). */
  readonly localeProfile: LocaleNumericProfile;
  /** Wall-clock ms the learner spent on this attempt (impure boundary — caller reads the clock). */
  readonly elapsedMs: number;
  /** BCP-47 tag: the language the problem/steps were presented in. */
  readonly contentLanguage: string;
  /** BCP-47 tag: the language an escalation explanation should be written in. */
  readonly explanationLanguage: string;
}

// ---------------------------------------------------------------------------
// SessionControllerOptions
// ---------------------------------------------------------------------------

export interface SessionControllerOptions {
  /** The active skill graph (from `loadGraph()`) — used by `route()`. */
  readonly graph: GraphDefinition;
  /** Injectable for testing; defaults to the MVP `ClipboardPromptProvider`. */
  readonly explanationProvider?: ExplanationProvider;
  /** Injectable clock for testing; defaults to `Date.now`. */
  readonly now?: () => number;
}

// ---------------------------------------------------------------------------
// SessionController — the orchestration unit
// ---------------------------------------------------------------------------

export class SessionController {
  private readonly graph: GraphDefinition;
  private readonly explanationProvider: ExplanationProvider;
  private readonly now: () => number;

  /** Session-scoped, in-memory only — NEVER persisted (anti-shame). */
  private readonly antiLoopMemory: AntiLoopMemory = createAntiLoopMemory();
  /** Session-scoped outstanding reroute targets not yet cleared this session. */
  private readonly diagnosticDebt = new Set<NodeId>();
  private completedTaskCount = 0;

  constructor(options: SessionControllerOptions) {
    this.graph = options.graph;
    this.explanationProvider = options.explanationProvider ?? new ClipboardPromptProvider();
    this.now = options.now ?? Date.now;
  }

  /**
   * The highest-priority outstanding diagnostic-debt node for this session,
   * or `null` if none. Feeds `@/navigation`'s `whereToNext` `diagnosticDebt` input.
   */
  getDiagnosticDebt(): NodeId | null {
    const [first] = this.diagnosticDebt;
    return first ?? null;
  }

  /** Number of 'correct' outcomes ingested so far this session. */
  getCompletedTaskCount(): number {
    return this.completedTaskCount;
  }

  /**
   * submit(input): Promise<SessionViewEvent>
   *
   * Runs `checkAnswer → ingestAttempt → applyScheduledReview → route` (the
   * last two conditionally) and returns exactly one structured, never-shaming
   * `SessionViewEvent`.
   */
  async submit(input: SubmitInput): Promise<SessionViewEvent> {
    const { task, outputs, localeProfile, elapsedMs, contentLanguage, explanationLanguage } = input;

    const result = await checkAnswer(task.steps, [...outputs], localeProfile);

    if (result.outcome === 'parse-error') {
      // ANTI-SHAME: a format slip is never a routing event. No ingestAttempt,
      // no route(), no firehose (checkAnswer itself already emitted none).
      return { kind: 'parse-hint', error: result.error };
    }

    const skillNode =
      result.outcome === 'correct'
        ? task.steps[task.steps.length - 1].skillNode
        : result.failedStep.skillNode;

    await ingestAttempt({
      skillNode,
      representationLevel: task.representation,
      outcome: result.outcome,
      elapsedMs,
    });

    // Spaced-repetition review only applies to ALREADY-scheduled nodes (a
    // dueAt was set once by the mastery gate on first abstract-crossing).
    const nowMs = this.now();
    const progressRow = await getProgress(skillNode);
    if (progressRow?.dueAt != null) {
      const node = this.graph.nodes.find((n) => n.id === skillNode);
      const targetMs = node
        ? resolveMasteryConfig(node).targetMs
        : DEFAULT_MASTERY_CONFIG.targetMs;
      await applyScheduledReview(
        skillNode,
        { correct: result.outcome === 'correct', elapsedMs, targetMs },
        nowMs
      );
    }

    if (result.outcome === 'correct') {
      this.completedTaskCount += 1;
      this.diagnosticDebt.delete(skillNode);

      const xpAwarded = await awardTaskCompletionXp();
      if (this.completedTaskCount === MIN_TASKS_FOR_KEPT_DAY) {
        await recordKeptDaySession(nowMs);
      }
      return { kind: 'correct', xpAwarded };
    }

    // --- 'failed-step' branch: build the mastery snapshot + route() --------
    const masteryLookup = await this.buildMasteryLookup();
    const decision = route(result.failedStep.skillNode, this.graph, masteryLookup, this.antiLoopMemory);

    // Record the visit AFTER acting on the decision (route() only reads).
    const previous = this.antiLoopMemory.get(decision.target);
    this.antiLoopMemory.set(decision.target, {
      visits: (previous?.visits ?? 0) + 1,
      lastApproach: task.representation,
    });

    // A genuine reroute away from the failed node is diagnostic debt; staying
    // at the same node (symptom-is-target) is not — it is just another go.
    if (decision.target !== result.failedStep.skillNode) {
      this.diagnosticDebt.add(decision.target);
    }

    if (decision.antiLoop?.escalateToExplanation) {
      const ctx = this.buildExplanationContext(
        task,
        result.failedStep,
        outputs,
        decision.antiLoop.explanationContext?.priorApproach,
        contentLanguage,
        explanationLanguage
      );
      const explainResult = await this.explanationProvider.explain(ctx);
      return { kind: 'escalation', result: explainResult, target: decision.target };
    }

    return {
      kind: 'staged-descent',
      descentPath: decision.descentPath,
      reason: decision.reason,
      target: decision.target,
      diagnostic: result.failedStep.diagnostic,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Build a full-graph `MasteryLookup` snapshot for `route()`. The fixture
   * graph is small (a handful of nodes); reading every node's progress row on
   * a failed-step is acceptable for the MVP shell (mirrors the same
   * full-snapshot approach `useMastery()` already uses for the node map).
   */
  private async buildMasteryLookup(): Promise<MasteryLookup> {
    const snapshot = new Map<NodeId, MasteryMetrics>();
    await Promise.all(
      this.graph.nodes.map(async (node) => {
        const row = await getProgress(node.id);
        const { mastery } = parseMasteryMetrics(row?.metrics ?? '');
        snapshot.set(node.id, mastery);
      })
    );
    return makeMasteryLookup(snapshot);
  }

  /**
   * Build the concrete `ExplanationRequestContext` for an escalation (DL-A of
   * feature-plan.md: a NEW type, never a retyping of stage-04's loose
   * `ExplanationContext`). `method` uses the skill-node slug as a
   * `LocalizedRef` key — `renderPrompt`'s default resolver turns e.g.
   * 'fruit-equations' into the readable label 'fruit equations' (see
   * @/explanation/render-prompt.ts's `defaultResolveLocalizedRef`).
   */
  private buildExplanationContext(
    task: GeneratedTask,
    failedStep: FailedStep,
    outputs: readonly WidgetOutput[],
    priorApproach: ExplanationRequestContext['priorApproach'],
    contentLanguage: string,
    explanationLanguage: string
  ): ExplanationRequestContext {
    return {
      problem: task.problem,
      studentAnswer: outputs[failedStep.stepIndex]?.rawInput ?? '',
      correctAnswer: failedStep.expected,
      method: { key: task.skillNode },
      steps: task.steps,
      failedStep,
      skillNode: failedStep.skillNode,
      contentLanguage,
      explanationLanguage,
      priorApproach,
    };
  }
}
