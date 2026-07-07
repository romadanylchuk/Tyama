/**
 * TaskScreen.tsx — the task-screen shell (Stage 06, Phase 6).
 *
 * COMPOSES (consumes, never reimplements):
 *   - `getGenerator(nodeId).generate(difficulty, rng)` — stage 02/05 generation,
 *     with `difficulty.elicitFromMastery` = the live mastery aggregate (the
 *     documented D02 contract: `selectBand(coordinate, bands)` picks the band,
 *     `elicitFromMastery: coordinate` propagates the SAME scalar the caller
 *     used to pick the band — see `src/core/__tests__/end-to-end.test.ts`).
 *   - `getWidget(step.inputMode)` + `buildWidgetConfig` (this phase) — mounts
 *     the correct blind widget.
 *   - `SessionController.submit(...)` (this phase) — runs
 *     `checkAnswer → ingestAttempt → applyScheduledReview → route`.
 *   - `useT()` / `useTheme()` — resolves every `LocalizedRef` under the
 *     active theme register; NO raw string is ever rendered by this screen.
 *   - `useMastery()` / `useMotivation()` — the header ring + XP chrome;
 *     BOTH `.refresh()`d after every submission (Phase-4-review Should-fix:
 *     ordinary, non-milestone writes never fire `subscribeDurable`).
 *
 * WIDGET MOUNTING MODEL (an explicit Phase-6 implementation-shape decision):
 *   Every shipped generator emits steps that ALL share one `inputMode` (driven
 *   uniformly by the task's `representationLevel` band). For 'multi-slot'
 *   tasks (fraction-simplification's pictorial/abstract bands), `getWidget`
 *   resolves the mode to `NumberWidget` (see `widget-registry.ts` — "the
 *   caller coordinates N slots by mounting N NumberWidgets"), so this screen
 *   feeds it ONE slot's `NumberWidgetConfig` at a time — `(widgetConfig as
 *   MultiSlotWidgetConfig).slots[outputs.length]` — reusing the SAME
 *   `outputs.length` index `handleWidgetOutput` already uses to know when all
 *   slots are collected. `NumberWidget` resets its own `rawInput` after every
 *   confirm, so re-feeding it a fresh per-slot config on each accumulated
 *   output is sufficient; no remount is needed between slots.
 *   For every other mode, this screen mounts ONE single-slot widget PER STEP,
 *   sequentially, accumulating one `WidgetOutput` per step before advancing —
 *   `checkAnswer` requires the FULL positionally-aligned output array in one
 *   call, so all of a task's steps are collected before `submit()` runs.
 *
 * PARSE-ERROR RECOVERY (an explicit implementation-shape decision):
 *   A `'parse-hint'` view-event resets ONLY the in-progress answer collection
 *   (`stepIndex`/`outputs`) for the SAME generated task — never a new problem,
 *   never a routing event (anti-shame: a format slip is not a skill failure).
 *
 * COMPANION LAYOUT ROOM:
 *   This screen renders no companion slot itself — the reserved region lives
 *   on `NodeMapScreen` (`layoutNodes().companionSlot`). Documented here only
 *   so a future stage-07 pass knows the task screen is NOT where the
 *   companion binds.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NodeId, GeneratedTask, Step } from '@/core/types';
import { loadGraph } from '@/core/graph/load-graph';
import { selectBand } from '@/core/difficulty/select-band';
import { createSeededRng } from '@/core/rng/seeded-rng';
import { getGenerator, resolveAvailability } from '@/core/generators/registry';
import { resolveMasteryConfig } from '@/core/mastery/mastery-config';
import { resolveLocaleProfile } from '@/parsing';
import { getWidget, type MultiSlotWidgetConfig, type WidgetOutput } from '@/widgets';
import { settings } from '@/repositories/settings-repository';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { nodeDisplayName } from '@/i18n/node-name';
import { deriveRingState, useMastery, useMotivation, MasteryRing, MIN_TASKS_FOR_KEPT_DAY } from '@/motivation';
import { buildWidgetConfig } from './build-widget-config';
import { SessionController, type SessionViewEvent } from './session-controller';

// ---------------------------------------------------------------------------
// TaskScreenProps
// ---------------------------------------------------------------------------

export interface TaskScreenProps {
  readonly nodeId: NodeId;
  /** Shared session-scoped controller (holds the session's AntiLoopMemory/diagnosticDebt). */
  readonly controller: SessionController;
  /** Return to the node map without switching nodes. */
  readonly onExit: () => void;
  /** Switch the active task-screen node (e.g. a staged-descent target). */
  readonly onNavigate: (nodeId: NodeId) => void;
}


/**
 * Display form of a learner's widget answer for the solved-step recap.
 * The tokens widget space-joins its digit tokens (so the locale parser can strip
 * group separators); collapse that whitespace back into the plain number so the
 * recap reads "🍎 = 10", not "🍎 = 1 0".
 */
function recapAnswer(output: WidgetOutput | undefined): string {
  return (output?.rawInput ?? '').replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// TaskScreen
// ---------------------------------------------------------------------------

export function TaskScreen({
  nodeId,
  controller,
  onExit,
  onNavigate,
}: TaskScreenProps): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();
  const mastery = useMastery();
  const motivation = useMotivation();

  const graph = useMemo(() => loadGraph(), []);
  const node = useMemo(() => graph.nodes.find((n) => n.id === nodeId), [graph, nodeId]);
  const availabilityByNode = useMemo(
    () => new Map(resolveAvailability(graph).map((a) => [a.nodeId, a.status] as const)),
    [graph]
  );

  // Has the learner reached mastery on THIS node? The learner-facing gate is
  // threshold AND evidence floor (minMasteryAttempts abstract-window entries —
  // see isMasteryComplete's rationale): a 2-answer hot streak stays honest
  // 'in-progress'. On mastery the correct-answer flow celebrates and offers
  // BOTH "one more" (voluntary repetition) and "choose next" (the map).
  // Recomputed after every mastery.refresh() (fired post-submit).
  const nodeMastered = useMemo(() => {
    if (!node) return false;
    const cfg = resolveMasteryConfig(node);
    const aggregate = mastery.aggregates.get(nodeId) ?? 0;
    const attempts = mastery.abstractAttempts.get(nodeId) ?? 0;
    return aggregate >= cfg.masteryThreshold && attempts >= cfg.minMasteryAttempts;
  }, [node, nodeId, mastery.aggregates, mastery.abstractAttempts]);

  const [task, setTask] = useState<GeneratedTask | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [outputs, setOutputs] = useState<readonly WidgetOutput[]>([]);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [viewEvent, setViewEvent] = useState<SessionViewEvent | null>(null);
  // Aggregate snapshot taken at submit time — the feedback panel shows the
  // GAIN ("+N%") as current-minus-snapshot once mastery.refresh() lands.
  // Anti-shame: only ever displayed when positive; a windowed dip shows nothing.
  const [aggregateAtSubmit, setAggregateAtSubmit] = useState(0);

  const generateTask = useCallback((): void => {
    if (!node) return;
    const generator = getGenerator(nodeId);
    if (!generator) {
      // Coming-soon node (no generator yet — a future graph node the app has
      // not shipped a generator for). The node-map never opens these, but
      // diagnostic routing legitimately descends to a causal prerequisite
      // that the MVP has not shipped a generator for. Clear any stale task so
      // the calm coming-soon panel (see render below) shows instead of
      // freezing on the previous node's task/feedback card.
      setTask(null);
      setViewEvent(null);
      setOutputs([]);
      setStepIndex(0);
      return;
    }
    const aggregate = mastery.aggregates.get(nodeId) ?? 0;
    const band = selectBand(aggregate, node.difficultyHooks.bands);
    const generated = generator.generate(
      {
        representationLevel: band.representationLevel,
        elicitFromMastery: aggregate,
        params: band.params,
      },
      createSeededRng(Date.now())
    );
    setTask(generated);
    setStepIndex(0);
    setOutputs([]);
    setStartedAt(Date.now());
    setViewEvent(null);
  }, [node, nodeId, mastery.aggregates]);

  useEffect(() => {
    if (!mastery.loading) {
      generateTask();
    }
    // Re-generate only when the target node or the mastery-loading gate
    // changes — `generateTask` itself is intentionally NOT a dependency here
    // (it would otherwise re-fire on every aggregate tick and discard the
    // learner's in-progress answer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, mastery.loading]);

  const contentLanguage = settings.get('contentLanguage');
  const explanationLanguage = settings.get('explanationLanguage');
  // Memoized on contentLanguage: settings.get is a cheap sync cache read, but
  // resolveLocaleProfile does the real work — recompute it only when the
  // content language actually changes, not on every render.
  const localeProfile = useMemo(() => resolveLocaleProfile(contentLanguage), [contentLanguage]);

  const isMultiSlot = task ? task.steps[0].inputMode === 'multi-slot' : false;
  const currentStep: Step | null = task ? (isMultiSlot ? task.steps[0] : task.steps[stepIndex]) : null;

  const handleWidgetOutput = useCallback(
    (output: WidgetOutput): void => {
      if (!task) return;
      const nextOutputs = [...outputs, output];

      if (isMultiSlot) {
        if (nextOutputs.length < task.steps.length) {
          setOutputs(nextOutputs);
          return;
        }
      } else if (stepIndex + 1 < task.steps.length) {
        setOutputs(nextOutputs);
        setStepIndex(stepIndex + 1);
        return;
      }

      // All outputs collected — submit.
      setOutputs(nextOutputs);
      setAggregateAtSubmit(mastery.aggregates.get(nodeId) ?? 0);
      const elapsedMs = Date.now() - startedAt;
      void controller
        .submit({
          task,
          outputs: nextOutputs,
          localeProfile,
          elapsedMs,
          contentLanguage,
          explanationLanguage,
        })
        .then((event) => {
          setViewEvent(event);
          mastery.refresh();
          motivation.refresh();
        });
    },
    [
      task,
      outputs,
      isMultiSlot,
      stepIndex,
      startedAt,
      localeProfile,
      contentLanguage,
      explanationLanguage,
      controller,
      mastery,
      motivation,
      nodeId,
    ]
  );

  const handleContinue = useCallback((): void => {
    if (!viewEvent) return;
    if (viewEvent.kind === 'parse-hint') {
      // A format slip — re-collect the SAME task's answers, never a new problem.
      setStepIndex(0);
      setOutputs([]);
      setStartedAt(Date.now());
      setViewEvent(null);
      return;
    }
    // Mastered this node with a correct answer → the primary action moves the
    // learner onward to the map (the MVP's forward hub) — but never as a
    // forced exit: the mastered panel ALSO offers "one more" (see
    // handlePracticeMore) so voluntary repetition stays a first-class choice.
    if (viewEvent.kind === 'correct' && nodeMastered) {
      onExit();
      return;
    }
    // ESCALATION-TARGET INVARIANT (do not invert): `viewEvent.target` is the
    // routed-TO node (the prerequisite to firm up), which is distinct from
    // `nodeId` — the node whose step just failed and triggered this routing.
    // A staged descent navigates AWAY to `target`; when `target === nodeId`
    // (symptom-is-target) there is nowhere to descend, so we fall through to a
    // fresh task on the SAME node below. Escalation likewise stays on the
    // current node (its `target` is informational only — the handoff is the
    // copied prompt, not a navigation), so it too falls through to a new task.
    if (viewEvent.kind === 'staged-descent' && viewEvent.target !== nodeId) {
      onNavigate(viewEvent.target);
      return;
    }
    // 'correct' / 'escalation' / same-node 'staged-descent' → a fresh task.
    generateTask();
  }, [viewEvent, nodeId, nodeMastered, onNavigate, onExit, generateTask]);

  // "Ще одну" on the mastered panel — voluntary repetition on an already-
  // mastered skill (a fluency trainer must never make practice impossible).
  const handlePracticeMore = useCallback((): void => {
    generateTask();
  }, [generateTask]);

  if (!node) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.color.background }]}>
        <Text style={{ color: tokens.color.textPrimary }}>{t({ key: 'common.allCaughtUp' })}</Text>
      </View>
    );
  }

  // Coming-soon target: the node exists in the graph but has no generator yet
  // (diagnostic routing can descend to a causal prerequisite the MVP hasn't
  // shipped). Render a calm, honest "being prepared" panel with a way forward,
  // never a frozen screen. Anti-shame: framed as foundation-building, not a wall.
  if (!getGenerator(nodeId)) {
    return (
      <View
        style={[styles.container, { backgroundColor: tokens.color.background }]}
        testID="task-screen-coming-soon"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onExit} accessibilityRole="button" testID="task-screen-back">
            <Text style={{ color: tokens.color.textSecondary }}>{t({ key: 'nav.back' })}</Text>
          </TouchableOpacity>
        </View>
        <View
          style={[styles.feedback, { backgroundColor: tokens.color.surface, borderColor: tokens.color.border }]}
        >
          <Text style={[styles.prompt, { color: tokens.color.textPrimary }]}>
            {t({ key: 'ring.notYetOpen' })}
          </Text>
          <Text style={{ color: tokens.color.textSecondary }}>{t({ key: 'task.comingSoonBody' })}</Text>
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: tokens.color.accent }]}
            onPress={onExit}
            accessibilityRole="button"
            testID="coming-soon-continue"
          >
            <Text style={styles.continueButtonText}>{t({ key: 'task.comingSoonBack' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!task || !currentStep || mastery.loading) {
    return (
      <View
        style={[styles.container, { backgroundColor: tokens.color.background }]}
        testID="task-screen-loading"
      >
        <ActivityIndicator size="large" color={tokens.color.accent} />
      </View>
    );
  }

  const masteryConfig = resolveMasteryConfig(node);
  const currentAggregate = mastery.aggregates.get(nodeId) ?? 0;
  const currentAttempts = mastery.abstractAttempts.get(nodeId) ?? 0;
  const ringState = deriveRingState(
    currentAggregate,
    availabilityByNode.get(nodeId) ?? 'coming-soon',
    masteryConfig,
    currentAttempts
  );
  // Feedback-panel progress feedback (anti-shame: gains only, dips show nothing).
  const progressDeltaPct =
    viewEvent?.kind === 'correct'
      ? Math.round((currentAggregate - aggregateAtSubmit) * 100)
      : 0;
  // Honest "at least N more tasks" — only estimable once the score is already
  // past the threshold and ONLY the evidence floor remains (window entries
  // accrue exactly one per task, so the remainder is a real lower bound).
  const attemptsRemaining =
    viewEvent?.kind === 'correct' &&
    !nodeMastered &&
    currentAggregate >= masteryConfig.masteryThreshold
      ? Math.max(0, masteryConfig.minMasteryAttempts - currentAttempts)
      : 0;
  // Session kept-day goal (display capped at the goal — "3/3", never "5/3").
  const keptDayDone = Math.min(controller.getCompletedTaskCount(), MIN_TASKS_FOR_KEPT_DAY);
  const widgetConfig = buildWidgetConfig(task, currentStep, contentLanguage, resolveMasteryConfig(node));
  const Widget = getWidget(currentStep.inputMode);
  // 'multi-slot': widgetConfig is a MultiSlotWidgetConfig ({ mode, slots }) covering
  // the whole task, but Widget (NumberWidget, per the registry's documented stub)
  // expects a single-slot NumberWidgetConfig. Feed it the slot for the CURRENT
  // accumulation position (outputs.length), mirroring handleWidgetOutput's own
  // slot-accumulation index, so decimalGlyph/finalOnly resolve correctly per slot.
  const activeWidgetConfig = isMultiSlot
    ? (widgetConfig as MultiSlotWidgetConfig).slots[outputs.length]
    : widgetConfig;

  return (
    <View
      style={[styles.container, { backgroundColor: tokens.color.background }]}
      testID="task-screen"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onExit} accessibilityRole="button" testID="task-screen-back">
          <Text style={{ color: tokens.color.textSecondary }}>{t({ key: 'nav.back' })}</Text>
        </TouchableOpacity>
        <MasteryRing nodeId={nodeId} fill={ringState.fill} state={ringState.state} />
        <View style={styles.headerStats}>
          {/* Kept-day goal — the streak requires MIN_TASKS_FOR_KEPT_DAY tasks;
              an invisible goal motivates nobody, so show "Сьогодні: n/goal". */}
          <Text style={{ color: tokens.color.textSecondary }} testID="kept-day-progress">
            {t({ key: 'task.dayProgress', vars: { done: keptDayDone, goal: MIN_TASKS_FOR_KEPT_DAY } })}
          </Text>
          {/* Total XP — a plain total, not the "+N XP" earned template. */}
          <Text style={{ color: tokens.color.textSecondary }}>
            {t({ key: 'task.xpTotal', vars: { xp: motivation.xp } })}
          </Text>
        </View>
      </View>

      <Text style={[styles.prompt, { color: tokens.color.textPrimary }]}>
        {t(task.problem.prompt)}
      </Text>

      {/* Recap of already-solved steps (e.g. "🍎 = 2") so the learner can use
          those values while answering a later step. Non-multi-slot only:
          multi-slot tasks collect every slot at once, so there is no in-between. */}
      {!isMultiSlot && stepIndex > 0 ? (
        <View style={styles.recap} testID="step-recap">
          {task.steps.slice(0, stepIndex).map((s, index) =>
            s.recap ? (
              <Text
                key={index}
                style={[styles.recapItem, { color: tokens.color.textSecondary }]}
              >
                {`${t(s.recap)} = ${recapAnswer(outputs[index])}`}
              </Text>
            ) : null
          )}
        </View>
      ) : null}

      {isMultiSlot ? (
        task.steps.map((s, index) => (
          <Text
            key={index}
            style={[styles.stepPrompt, { color: tokens.color.textSecondary }]}
          >
            {t(s.prompt)}
          </Text>
        ))
      ) : (
        <>
          {/* Step indicator — a multi-step task announces its shape upfront
              ("Крок 1 з 2") instead of surprising the learner with question 2. */}
          {task.steps.length > 1 ? (
            <Text
              style={[styles.stepIndicator, { color: tokens.color.textSecondary }]}
              testID="step-indicator"
            >
              {t({ key: 'task.stepOf', vars: { current: stepIndex + 1, total: task.steps.length } })}
            </Text>
          ) : null}
          <Text style={[styles.stepPrompt, { color: tokens.color.textSecondary }]}>
            {t(currentStep.prompt)}
          </Text>
        </>
      )}

      {viewEvent ? (
        <TaskFeedback
          viewEvent={viewEvent}
          nodeMastered={nodeMastered}
          progressDeltaPct={progressDeltaPct}
          attemptsRemaining={attemptsRemaining}
          onContinue={handleContinue}
          onPracticeMore={handlePracticeMore}
        />
      ) : (
        <Widget config={activeWidgetConfig} onOutput={handleWidgetOutput} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TaskFeedback — the calm, never-shaming resolution panel
// ---------------------------------------------------------------------------

interface TaskFeedbackProps {
  readonly viewEvent: SessionViewEvent;
  /** True when the current node has reached mastery — turns 'correct' into a "move on" prompt. */
  readonly nodeMastered: boolean;
  /**
   * Mastery-aggregate gain since submit, in whole percent. Rendered only when
   * > 0 (anti-shame: gains are celebrated, windowed dips show nothing).
   */
  readonly progressDeltaPct: number;
  /**
   * Honest lower bound on tasks left to mastery (evidence floor remainder).
   * Rendered only when > 0 — 0 means "not estimable yet" or already mastered.
   */
  readonly attemptsRemaining: number;
  readonly onContinue: () => void;
  /** Secondary action on the mastered panel: one more task on the SAME node. */
  readonly onPracticeMore: () => void;
}

/**
 * Renders exactly one `SessionViewEvent` as calm, resolved copy — never a
 * wrong/red/✗/buzzer/shake/penalty surface. Every branch resolves its copy
 * via `useT()` under the active theme register (anti-shame invariant: no
 * localized string is ever hand-assembled outside the i18n seam).
 */
function TaskFeedback({
  viewEvent,
  nodeMastered,
  progressDeltaPct,
  attemptsRemaining,
  onContinue,
  onPracticeMore,
}: TaskFeedbackProps): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();

  let body: React.JSX.Element;
  let continueLabelKey = 'task.next';
  let showPracticeMore = false;

  switch (viewEvent.kind) {
    case 'correct': {
      if (nodeMastered) {
        // Mastery reached — celebrate and offer BOTH ways forward: the primary
        // action moves on to the map, the secondary keeps practicing here
        // (voluntary repetition is a feature of a fluency trainer, not a bug).
        continueLabelKey = 'task.chooseNext';
        showPracticeMore = true;
        body = (
          <>
            <Text style={{ color: tokens.color.textPrimary }}>{t({ key: 'ring.mastered' })}</Text>
            <Text style={{ color: tokens.color.textSecondary }}>{t({ key: 'task.masteredBody' })}</Text>
          </>
        );
        break;
      }
      body = (
        <>
          <Text style={{ color: tokens.color.textPrimary }}>{t({ key: 'feedback.correct' })}</Text>
          <Text style={{ color: tokens.color.textSecondary }}>
            {t({ key: 'task.xpEarned', vars: { xp: viewEvent.xpAwarded } })}
          </Text>
          {/* Visible progress: the mastery gain this answer produced (gains only). */}
          {progressDeltaPct > 0 ? (
            <Text style={{ color: tokens.color.textSecondary }} testID="mastery-delta">
              {t({ key: 'task.masteryDelta', vars: { delta: progressDeltaPct } })}
            </Text>
          ) : null}
          {/* Honest remaining-work estimate once only the evidence floor is left. */}
          {attemptsRemaining > 0 ? (
            <Text style={{ color: tokens.color.textSecondary }} testID="attempts-remaining">
              {t({ key: 'task.attemptsRemaining', vars: { count: attemptsRemaining } })}
            </Text>
          ) : null}
        </>
      );
      break;
    }
    case 'parse-hint': {
      continueLabelKey = 'common.retry';
      body = (
        <>
          <Text style={{ color: tokens.color.textPrimary }}>{t({ key: 'hint.formatHeader' })}</Text>
          {/* PARSE_HINT_KEYS in @/i18n/resolve-ref.ts maps every ParseErrorKind to
              exactly 'parse.<kind>' — reproduced here as a plain key so this
              component can resolve it through the SAME useT() seam every other
              string on this screen uses (formatParseHint's TFunction shape is
              the raw i18next `t`, not useT()'s LocalizedRef-based resolver). */}
          <Text style={{ color: tokens.color.textSecondary }}>
            {t({ key: `parse.${viewEvent.error.kind}` })}
          </Text>
        </>
      );
      break;
    }
    case 'staged-descent': {
      body = (
        <>
          <Text style={{ color: tokens.color.textPrimary }}>{t({ key: 'descent.header' })}</Text>
          <Text style={{ color: tokens.color.textSecondary }}>
            {t({ key: 'descent.body', vars: { node: nodeDisplayName(t, viewEvent.target) } })}
          </Text>
        </>
      );
      break;
    }
    case 'escalation': {
      const copiedKey =
        viewEvent.result.status === 'copy-failed'
          ? 'escalation.clipboardFailed'
          : 'escalation.clipboardCopied';
      body = (
        <>
          <Text style={{ color: tokens.color.textPrimary }}>{t({ key: copiedKey })}</Text>
          <Text style={{ color: tokens.color.textSecondary }}>
            {t({ key: 'clipboard.pasteInstruction' })}
          </Text>
        </>
      );
      break;
    }
  }

  return (
    <View
      style={[styles.feedback, { backgroundColor: tokens.color.surface, borderColor: tokens.color.border }]}
      testID="task-feedback"
    >
      {body}
      {/* Secondary FIRST on the mastered panel: keep practicing here. */}
      {showPracticeMore ? (
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: tokens.color.accent }]}
          onPress={onPracticeMore}
          accessibilityRole="button"
          testID="task-feedback-practice-more"
        >
          <Text style={[styles.secondaryButtonText, { color: tokens.color.accent }]}>
            {t({ key: 'task.oneMore' })}
          </Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.continueButton, { backgroundColor: tokens.color.accent }]}
        onPress={onContinue}
        accessibilityRole="button"
        testID="task-feedback-continue"
      >
        <Text style={styles.continueButtonText}>{t({ key: continueLabelKey })}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prompt: {
    fontSize: 20,
    fontWeight: '600',
  },
  stepPrompt: {
    fontSize: 15,
  },
  stepIndicator: {
    fontSize: 12,
  },
  headerStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  recap: {
    gap: 2,
  },
  recapItem: {
    fontSize: 15,
    fontWeight: '600',
  },
  feedback: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  continueButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
