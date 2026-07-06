/**
 * AppShell.tsx — the top-level presentation shell (Stage 06, Phase 6).
 *
 * OWNS:
 *   - Mounting `<ThemeProvider>` (Phase 2) so every descendant screen reads
 *     `useTheme()`/`useT()` consistently.
 *   - Initializing i18n (`initI18n`, Phase 1) from the hydrated
 *     `uiLanguage` setting. (App.tsx's own startup chain — Phase 7 — hydrates
 *     settings and validates the graph BEFORE this component ever mounts;
 *     this call is therefore safe to issue on `AppShell`'s own first effect.)
 *   - Running `validateCuratedPath`/`validateRegistry` (Phase 5 / stage 02) at
 *     startup, calmly: violations are logged (dev diagnostic), never thrown
 *     to the learner — this is a build-mistake catcher, not a user-facing
 *     error surface.
 *   - Computing the session's entry node via `whereToNext` (Phase 5) —
 *     `diagnosticDebt` from the session's own `SessionController`,
 *     `dueReviews` from `getDueNodes`, `curatedPath` from
 *     `CURATED_ENTRY_PATH`.
 *   - Routing node-map ↔ task-screen via local component state (no nav
 *     library needed for the MVP shell — matches the plan's explicit choice).
 *
 * SESSION-SCOPED CONTROLLER, ONE PER SHELL MOUNT:
 *   A single `SessionController` instance is created once (via `useRef`) and
 *   threaded into every `TaskScreen` mount for the shell's lifetime, so its
 *   `AntiLoopMemory`/`diagnosticDebt` persist across a "practice this now"
 *   staged-descent navigation and across repeated tasks on the same node —
 *   but are discarded (never persisted) the moment the shell itself unmounts.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { GraphDefinition, NodeId } from '@/core/types';
import { loadGraph } from '@/core/graph/load-graph';
import { resolveAvailability, validateRegistry } from '@/core/generators/registry';
import { makeMasteryLookup } from '@/core/mastery/mastery-lookup';
import { parseMasteryMetrics, type MasteryMetrics } from '@/core/mastery/mastery-metrics';
import { toReviewItem } from '@/core/spaced-repetition';
import { getDueNodes, getProgress } from '@/repositories';
import { settings } from '@/repositories/settings-repository';
import { CURATED_ENTRY_PATH, validateCuratedPath, whereToNext } from '@/navigation';
import { ThemeProvider, useTheme } from '@/theme';
import { initI18n, useT } from '@/i18n';
import { NodeMapScreen } from './node-map/NodeMapScreen';
import { TaskScreen } from './task-screen/TaskScreen';
import { SessionController } from './task-screen/session-controller';
import { OnboardingFlow } from './onboarding';

// ---------------------------------------------------------------------------
// Screen — local routing state (no nav library for the MVP shell)
// ---------------------------------------------------------------------------

type Screen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'onboarding' }
  | { readonly kind: 'node-map' }
  | { readonly kind: 'task'; readonly nodeId: NodeId };

// ---------------------------------------------------------------------------
// computeEntryNode — wires whereToNext + curated-path + spaced-repetition
// ---------------------------------------------------------------------------

async function computeEntryNode(
  graph: GraphDefinition,
  controller: SessionController
): Promise<NodeId | null> {
  const now = Date.now();
  const dueRows = await getDueNodes(now);
  const dueReviews = dueRows.map(toReviewItem);

  const snapshot = new Map<NodeId, MasteryMetrics>();
  await Promise.all(
    graph.nodes.map(async (node) => {
      const row = await getProgress(node.id);
      const { mastery } = parseMasteryMetrics(row?.metrics ?? '');
      snapshot.set(node.id, mastery);
    })
  );
  const masteryLookup = makeMasteryLookup(snapshot);

  // Stage 07 Decision Log 1: honor an onboarding-seeded `currentNodeId` as the
  // curated-path HEAD, rather than rewriting whereToNext's own priority (that
  // seam stays stage-06-locked). whereToNext walks curatedPath in order,
  // skipping coming-soon/already-mastered nodes, so prepending an available
  // currentNodeId here makes it win that tier while diagnosticDebt/dueReviews
  // still supervene exactly as before. KNOWN MVP LIMITATION: nothing writes
  // currentNodeId again in-session after onboarding, so the learner keeps
  // returning to the placement stop-node until due-reviews/debt supervene —
  // acceptable and non-shaming for the MVP.
  const currentNodeId = settings.get('currentNodeId');
  let curatedPath: readonly NodeId[] = CURATED_ENTRY_PATH;
  if (currentNodeId !== null) {
    const availability = new Map(
      resolveAvailability(graph).map((a) => [a.nodeId, a.status] as const)
    );
    if (availability.get(currentNodeId) === 'available') {
      curatedPath = [currentNodeId, ...CURATED_ENTRY_PATH.filter((id) => id !== currentNodeId)];
    }
  }

  const result = whereToNext({
    diagnosticDebt: controller.getDiagnosticDebt(),
    dueReviews,
    curatedPath,
    graph,
    masteryLookup,
  });

  return result?.nodeId ?? null;
}

// ---------------------------------------------------------------------------
// AppShell — public entry point
// ---------------------------------------------------------------------------

export function AppShell(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppShellContent />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// AppShellContent — startup + routing (a child of ThemeProvider so it can
// read useTheme()/useT() for its own loading chrome)
// ---------------------------------------------------------------------------

function AppShellContent(): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();

  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const controllerRef = useRef<SessionController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new SessionController({ graph: loadGraph() });
  }

  // Resolves the post-onboarding / returning-learner screen: the same
  // validate-then-compute-entry sequence, shared by the initial mount effect
  // and the onboarding-completion handler below.
  const resolveMainLoopScreen = useCallback(async (): Promise<Screen> => {
    const graph = loadGraph();

    // A DB-read rejection inside computeEntryNode must never strand the
    // learner on the loading spinner. Degrade calmly to the node-map — the
    // same anti-shame-safe "nothing proposable" path already taken when
    // `entry === null`.
    let entry: NodeId | null = null;
    try {
      entry = await computeEntryNode(graph, controllerRef.current!);
    } catch (err) {
      console.warn('[AppShell] entry-node computation failed (non-fatal, falling back to node-map):', err);
      entry = null;
    }
    return entry !== null ? { kind: 'task', nodeId: entry } : { kind: 'node-map' };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async (): Promise<void> => {
      await initI18n(settings.get('uiLanguage'));

      const graph = loadGraph();

      // Calm, non-fatal startup diagnostics — build-mistake catchers, never a
      // learner-facing error surface.
      const curatedViolations = validateCuratedPath(graph);
      if (curatedViolations.length > 0) {
        console.warn('[AppShell] curated-path violations (non-fatal):', curatedViolations);
      }
      try {
        validateRegistry(graph);
      } catch (err) {
        console.warn('[AppShell] generator-registry validation (non-fatal):', err);
      }

      // First-run onboarding gate (stage 07): an incomplete flag routes to the
      // separate onboarding flow instead of computing an entry node at all.
      if (!settings.get('onboardingComplete')) {
        if (!cancelled) {
          setScreen({ kind: 'onboarding' });
        }
        return;
      }

      const next = await resolveMainLoopScreen();
      if (!cancelled) {
        setScreen(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolveMainLoopScreen]);

  const handleSelectNode = useCallback((nodeId: NodeId): void => {
    setScreen({ kind: 'task', nodeId });
  }, []);

  const handleExit = useCallback((): void => {
    setScreen({ kind: 'node-map' });
  }, []);

  const handleNavigate = useCallback((nodeId: NodeId): void => {
    setScreen({ kind: 'task', nodeId });
  }, []);

  const handleOnboardingComplete = useCallback((): void => {
    void (async (): Promise<void> => {
      const next = await resolveMainLoopScreen();
      setScreen(next);
    })();
  }, [resolveMainLoopScreen]);

  if (screen.kind === 'loading') {
    // Calm loading chrome — resolved via the same i18n seam as every other screen.
    return <LoadingChrome background={tokens.color.background} label={t({ key: 'task.loading' })} />;
  }

  if (screen.kind === 'onboarding') {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  if (screen.kind === 'node-map') {
    return <NodeMapScreen onSelectNode={handleSelectNode} />;
  }

  return (
    <TaskScreen
      nodeId={screen.nodeId}
      controller={controllerRef.current}
      onExit={handleExit}
      onNavigate={handleNavigate}
    />
  );
}

// ---------------------------------------------------------------------------
// LoadingChrome — tiny local component
// ---------------------------------------------------------------------------

function LoadingChrome({ background, label }: { background: string; label: string }): React.JSX.Element {
  return (
    <View style={[styles.loadingContainer, { backgroundColor: background }]} testID="app-shell-loading">
      <ActivityIndicator size="large" />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingLabel: {
    fontSize: 14,
  },
});
