/**
 * PlacementScreen.tsx — onboarding screen 4: the real shortened-placement
 * ladder (stage 07, Phase 4).
 *
 * MIRRORS `TaskScreen.tsx`'s generate/render pattern, WITHOUT `SessionController`:
 *   Placement never ingests an attempt, never runs spaced-repetition, never
 *   calls `route()` — it drives the Phase-2 `PlacementController` directly
 *   (reused unchanged; this screen never reimplements placement logic). The
 *   ONLY seams this file touches for persistence are the ones
 *   `PlacementController` already owns (`upsertNonMilestoneProgress` via
 *   `recordProbe`, `settings.currentNodeId` via `finish()`/`skipToFloor()`).
 *
 * WHY ABSTRACT IS FORCED (never derived from the current aggregate):
 *   Every probe is generated with `difficulty.representationLevel = 'abstract'`
 *   — only an abstract-level probe can lift the mastery coordinate at all (see
 *   `DEFAULT_MASTERY_CONFIG.levelCeilings`, `placement-seed.ts`). The band used
 *   for `difficulty.params` is still resolved via `selectBand(seedCoordinate,
 *   node.difficultyHooks.bands)` — that ONLY supplies the opaque per-generator
 *   `params` (numeric ranges etc.); `representationLevel` is deliberately
 *   overridden to `'abstract'` regardless of which band `selectBand` lands on,
 *   because a placement probe's whole purpose is CPA-ceiling-safe abstract
 *   elicitation, not "whatever band the target coordinate nominally maps to."
 *
 * LOW-STAKES FRAMING, NEVER "TEST"/"EXAM"/"SCORE" (anti-shame, highest-risk
 * onboarding moment):
 *   - The ladder opens on an explicit `'intro'` step ("let's see where to
 *     start") before any probe is shown — never launched straight into a task.
 *   - `onboarding.placementSlowOk` is shown alongside every probe: placement
 *     applies no speed gate (`PlacementController.recordProbe` never takes an
 *     elapsed-time argument at all — there is nothing to be slow AT).
 *   - A `parse-error` outcome is a gentle re-prompt of the SAME probe — the
 *     identical `hint.formatHeader` / `parse.<kind>` copy `TaskScreen` uses,
 *     never a routing/failure surface (mirrors `checkAnswer`'s own contract:
 *     a format slip is not a skill failure).
 *   - A `failed-step` outcome (the first non-success) STOPS the ladder and is
 *     framed via the existing calm staged-descent copy (`descent.header` /
 *     `descent.body`, "let's firm up X first") — never a verdict, never a
 *     score, never a red/wrong/cross surface. This is the exact same framing
 *     `TaskScreen`'s `TaskFeedback` uses for an in-session staged descent.
 *   - "Skip"/"done for now" is available before AND during the ladder; it
 *     delegates entirely to the `onSkip` prop (which the caller — `OnboardingFlow`
 *     — wires to `controller.skipToFloor()`), never nulling the entry node.
 *
 * WIDGET MOUNTING MODEL — copied verbatim from `TaskScreen.tsx`:
 *   A 'multi-slot' task (fraction-simplification's abstract band) renders ONE
 *   `NumberWidget` per slot, fed `(widgetConfig as MultiSlotWidgetConfig).slots[
 *   outputs.length]`; every other mode mounts one single-slot widget per step,
 *   sequentially, accumulating one `WidgetOutput` per step before submitting.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { GeneratedTask, NodeId, Step } from '@/core/types';
import { loadGraph } from '@/core/graph/load-graph';
import { selectBand } from '@/core/difficulty/select-band';
import { createSeededRng } from '@/core/rng/seeded-rng';
import { getGenerator } from '@/core/generators/registry';
import { resolveMasteryConfig } from '@/core/mastery/mastery-config';
import { resolveLocaleProfile, type ParseError } from '@/parsing';
import { getWidget, type MultiSlotWidgetConfig, type WidgetOutput } from '@/widgets';
import { checkAnswer } from '@/checking';
import { settings } from '@/repositories/settings-repository';
import { PLACEMENT_CONFIG } from '@/config/placement';
import { buildWidgetConfig } from '@/ui/task-screen/build-widget-config';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import type { PlacementController } from './placement-controller';

// ---------------------------------------------------------------------------
// PlacementScreenProps
// ---------------------------------------------------------------------------

export interface PlacementScreenProps {
  /** The Phase-2 RN-free ladder orchestrator this screen drives (reused, never reimplemented). */
  readonly controller: PlacementController;
  /** Called once with the real, non-null entry node once the ladder finishes. */
  readonly onDone: (entryNode: NodeId) => void;
  /** Called when the learner chooses "Skip"/"done for now" — never nulls the entry node. */
  readonly onSkip: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// nodeLabel — a readable fallback label for a NodeId slug
// (mirrors TaskScreen.tsx's own module-local helper: no per-node display-name
// catalog exists yet in the MVP)
// ---------------------------------------------------------------------------

function nodeLabel(nodeId: NodeId): string {
  return nodeId.replace(/[-_]+/g, ' ');
}

// ---------------------------------------------------------------------------
// ViewState — the screen's local state machine
// ---------------------------------------------------------------------------

type ViewState =
  | { readonly kind: 'intro' }
  | {
      readonly kind: 'probe';
      readonly task: GeneratedTask;
      readonly stepIndex: number;
      readonly outputs: readonly WidgetOutput[];
    }
  | { readonly kind: 'parse-hint'; readonly task: GeneratedTask; readonly error: ParseError }
  | { readonly kind: 'stopped'; readonly stoppedNode: NodeId };

// ---------------------------------------------------------------------------
// PlacementScreen
// ---------------------------------------------------------------------------

export function PlacementScreen({
  controller,
  onDone,
  onSkip,
}: PlacementScreenProps): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();

  const graph = useMemo(() => loadGraph(), []);
  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  const [viewState, setViewState] = useState<ViewState>({ kind: 'intro' });

  const contentLanguage = settings.get('contentLanguage');
  const localeProfile = useMemo(() => resolveLocaleProfile(contentLanguage), [contentLanguage]);

  const finishAndExit = useCallback((): void => {
    void (async (): Promise<void> => {
      const entryNode = await controller.finish();
      onDone(entryNode);
    })();
  }, [controller, onDone]);

  const generateProbe = useCallback(
    (node: NodeId): void => {
      const graphNode = nodesById.get(node);
      const generator = getGenerator(node);
      if (!graphNode || !generator) {
        // Defensive: PLACEMENT_CONFIG.ascentChain is asserted (Phase 1's
        // placement.test.ts) to reference only generator-backed graph nodes.
        // If this ever diverges, end the ladder calmly rather than crash.
        finishAndExit();
        return;
      }
      // `params` is resolved via selectBand at the target seed coordinate;
      // `representationLevel` is deliberately forced to 'abstract' (see file
      // header) regardless of which band `selectBand` lands on.
      const band = selectBand(PLACEMENT_CONFIG.seedCoordinate, graphNode.difficultyHooks.bands);
      const generated = generator.generate(
        {
          representationLevel: 'abstract',
          elicitFromMastery: PLACEMENT_CONFIG.seedCoordinate,
          params: band.params,
        },
        createSeededRng(Date.now())
      );
      setViewState({ kind: 'probe', task: generated, stepIndex: 0, outputs: [] });
    },
    [nodesById, finishAndExit]
  );

  const submitProbe = useCallback(
    async (task: GeneratedTask, outputs: readonly WidgetOutput[]): Promise<void> => {
      const result = await checkAnswer(task.steps, [...outputs], localeProfile);

      if (result.outcome === 'parse-error') {
        // ANTI-SHAME: a format slip re-prompts the SAME probe; the ladder
        // index does not advance (PlacementController.recordProbe('parse-error')
        // is a documented no-op) and nothing is ever written.
        await controller.recordProbe({ kind: 'parse-error' });
        setViewState({ kind: 'parse-hint', task, error: result.error });
        return;
      }

      if (result.outcome === 'failed-step') {
        // First non-success: the ladder stops here, non-shamingly. The failing
        // node itself becomes the entry node `finish()` will return.
        await controller.recordProbe({ kind: 'failed-step' });
        setViewState({ kind: 'stopped', stoppedNode: task.skillNode });
        return;
      }

      // 'correct' — seed this node (never lowers a prior coordinate) and ascend.
      await controller.recordProbe({ kind: 'correct' });
      const nextNode = controller.currentProbeNode();
      if (nextNode === null) {
        finishAndExit();
        return;
      }
      generateProbe(nextNode);
    },
    [controller, localeProfile, finishAndExit, generateProbe]
  );

  const handleWidgetOutput = useCallback(
    (output: WidgetOutput): void => {
      if (viewState.kind !== 'probe') return;
      const { task, stepIndex, outputs } = viewState;
      const nextOutputs = [...outputs, output];
      const isMultiSlot = task.steps[0].inputMode === 'multi-slot';

      if (isMultiSlot) {
        if (nextOutputs.length < task.steps.length) {
          setViewState({ kind: 'probe', task, stepIndex, outputs: nextOutputs });
          return;
        }
      } else if (stepIndex + 1 < task.steps.length) {
        setViewState({ kind: 'probe', task, stepIndex: stepIndex + 1, outputs: nextOutputs });
        return;
      }

      // All outputs collected — check.
      void submitProbe(task, nextOutputs);
    },
    [viewState, submitProbe]
  );

  const handleBegin = useCallback((): void => {
    const node = controller.currentProbeNode();
    if (node === null) {
      // 0-length ladder (config edge case) — finish immediately, never nullable.
      finishAndExit();
      return;
    }
    generateProbe(node);
  }, [controller, generateProbe, finishAndExit]);

  const handleSkip = useCallback((): void => {
    void onSkip();
  }, [onSkip]);

  const handleParseHintContinue = useCallback((): void => {
    if (viewState.kind !== 'parse-hint') return;
    // Re-collect the SAME task's answers from the start — never a new probe.
    setViewState({ kind: 'probe', task: viewState.task, stepIndex: 0, outputs: [] });
  }, [viewState]);

  const handleStoppedContinue = useCallback((): void => {
    finishAndExit();
  }, [finishAndExit]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (viewState.kind === 'intro') {
    return (
      <View
        style={[styles.container, { backgroundColor: tokens.color.background }]}
        testID="onboarding-placement-screen"
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: tokens.color.textPrimary }]}>
            {t({ key: 'onboarding.placementIntro' })}
          </Text>
          <Text style={[styles.description, { color: tokens.color.textSecondary }]}>
            {t({ key: 'onboarding.placementSlowOk' })}
          </Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: tokens.color.accent }]}
            onPress={handleBegin}
            accessibilityRole="button"
            testID="onboarding-placement-begin"
          >
            <Text style={styles.primaryButtonLabel}>{t({ key: 'common.continue' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSkip}
            accessibilityRole="button"
            testID="onboarding-placement-skip"
          >
            <Text style={{ color: tokens.color.textSecondary }}>{t({ key: 'common.skip' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (viewState.kind === 'parse-hint') {
    return (
      <View
        style={[styles.container, { backgroundColor: tokens.color.background }]}
        testID="onboarding-placement-screen"
      >
        <View
          style={[styles.feedback, { backgroundColor: tokens.color.surface, borderColor: tokens.color.border }]}
          testID="onboarding-placement-parse-hint"
        >
          <Text style={{ color: tokens.color.textPrimary }}>{t({ key: 'hint.formatHeader' })}</Text>
          {/* Same key TaskScreen's TaskFeedback resolves — one PARSE_HINT_KEYS
              dispatch surface for the whole app (see @/i18n/resolve-ref.ts). */}
          <Text style={{ color: tokens.color.textSecondary }}>
            {t({ key: `parse.${viewState.error.kind}` })}
          </Text>
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: tokens.color.accent }]}
            onPress={handleParseHintContinue}
            accessibilityRole="button"
            testID="onboarding-placement-parse-continue"
          >
            <Text style={styles.primaryButtonLabel}>{t({ key: 'common.retry' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (viewState.kind === 'stopped') {
    return (
      <View
        style={[styles.container, { backgroundColor: tokens.color.background }]}
        testID="onboarding-placement-screen"
      >
        <View
          style={[styles.feedback, { backgroundColor: tokens.color.surface, borderColor: tokens.color.border }]}
          testID="onboarding-placement-stopped"
        >
          <Text style={{ color: tokens.color.textPrimary }}>{t({ key: 'descent.header' })}</Text>
          <Text style={{ color: tokens.color.textSecondary }}>
            {t({ key: 'descent.body', vars: { node: nodeLabel(viewState.stoppedNode) } })}
          </Text>
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: tokens.color.accent }]}
            onPress={handleStoppedContinue}
            accessibilityRole="button"
            testID="onboarding-placement-stopped-continue"
          >
            <Text style={styles.primaryButtonLabel}>{t({ key: 'common.continue' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // viewState.kind === 'probe'
  const { task } = viewState;
  const node = nodesById.get(task.skillNode);
  const isMultiSlot = task.steps[0].inputMode === 'multi-slot';
  const currentStep: Step = isMultiSlot ? task.steps[0] : task.steps[viewState.stepIndex];
  const widgetConfig = buildWidgetConfig(
    task,
    currentStep,
    contentLanguage,
    node ? resolveMasteryConfig(node) : undefined
  );
  const Widget = getWidget(currentStep.inputMode);
  const activeWidgetConfig = isMultiSlot
    ? (widgetConfig as MultiSlotWidgetConfig).slots[viewState.outputs.length]
    : widgetConfig;

  return (
    <View
      style={[styles.container, { backgroundColor: tokens.color.background }]}
      testID="onboarding-placement-screen"
    >
      <View style={styles.header}>
        <Text style={[styles.description, { color: tokens.color.textSecondary }]}>
          {t({ key: 'onboarding.placementSlowOk' })}
        </Text>
      </View>

      <Text style={[styles.prompt, { color: tokens.color.textPrimary }]}>{t(task.problem.prompt)}</Text>

      {isMultiSlot ? (
        task.steps.map((s, index) => (
          <Text key={index} style={[styles.stepPrompt, { color: tokens.color.textSecondary }]}>
            {t(s.prompt)}
          </Text>
        ))
      ) : (
        <Text style={[styles.stepPrompt, { color: tokens.color.textSecondary }]}>
          {t(currentStep.prompt)}
        </Text>
      )}

      <Widget config={activeWidgetConfig} onOutput={handleWidgetOutput} />

      <TouchableOpacity
        onPress={handleSkip}
        accessibilityRole="button"
        testID="onboarding-placement-skip"
      >
        <Text style={{ color: tokens.color.textSecondary }}>{t({ key: 'common.skip' })}</Text>
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
    padding: 24,
    gap: 12,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  footer: {
    gap: 16,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    fontSize: 15,
    lineHeight: 21,
  },
  prompt: {
    fontSize: 20,
    fontWeight: '600',
  },
  stepPrompt: {
    fontSize: 15,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
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
});
