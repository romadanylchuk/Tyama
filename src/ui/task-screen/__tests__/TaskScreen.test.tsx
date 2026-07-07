/**
 * TaskScreen.test.tsx — thin render test for the task screen (Stage 06, Phase 6).
 *
 * Covers the Phase 6 completion criterion:
 *   - Renders under <ThemeProvider>, generates a task, and mounts the RIGHT
 *     widget for the resolved band's inputMode (fruit-equations at aggregate
 *     0 -> lowest band -> pictorial -> 'tokens').
 *   - No shame-vocabulary surface (padlock/locked/wrong/red) appears anywhere.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useTestDb } from '../../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { upsertNonMilestoneProgress } from '@/repositories/progress-repository';
import { serializeMasteryMetrics } from '@/core/mastery/mastery-metrics';
import { GRAPH_FIXTURE } from '@/core/graph/graph-fixture';
import { ThemeProvider } from '@/theme';
import { TaskScreen } from '../TaskScreen';
import { SessionController } from '../session-controller';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

/** Seed a node's progress row with a given aggregate mastery scalar (mirrors useMastery.test.ts). */
async function seedAggregate(nodeId: string, aggregate: number): Promise<void> {
  const mastery = {
    slices: { abstract: { window: [aggregate], scalar: aggregate } },
    aggregate,
  };
  await upsertNonMilestoneProgress({
    nodeId,
    metrics: serializeMasteryMetrics({}, mastery),
  });
}

describe('TaskScreen', () => {
  it('generates a task and mounts the tokens widget for a novice on fruit-equations', async () => {
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const { getByTestId, queryByText } = render(
      <ThemeProvider>
        <TaskScreen
          nodeId="fruit-equations"
          controller={controller}
          onExit={jest.fn()}
          onNavigate={jest.fn()}
        />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('task-screen')).toBeTruthy());
    // Lowest band for fruit-equations (aggregate 0) is pictorial -> 'tokens' inputMode.
    await waitFor(() => expect(getByTestId('token-palette')).toBeTruthy());

    expect(queryByText(/locked/i)).toBeNull();
    expect(queryByText(/wrong/i)).toBeNull();
    expect(queryByText('🔒')).toBeNull();
  });

  it('renders a calm coming-soon panel (not a frozen screen) when routed to a generator-less node — regression for the staged-descent dead-end', async () => {
    // `addition-within-20` is a real root prerequisite in the graph but ships no
    // generator (coming-soon). Diagnostic staged-descent can navigate here; the
    // screen must degrade calmly with a way forward instead of freezing on a
    // stale task/feedback card.
    const onExit = jest.fn();
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const { getByTestId, queryByTestId } = render(
      <ThemeProvider>
        <TaskScreen
          nodeId="addition-within-20"
          controller={controller}
          onExit={onExit}
          onNavigate={jest.fn()}
        />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('task-screen-coming-soon')).toBeTruthy());
    // It must NOT render the normal task surface (no frozen widget/keypad).
    expect(queryByTestId('task-screen')).toBeNull();
    // The forward action returns to the node map.
    fireEvent.press(getByTestId('coming-soon-continue'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('routes a mastered node to the node map on a correct answer instead of re-drilling — regression for the mastered-node loop', async () => {
    // Seed number-bonds at/above mastery threshold so nodeMastered is true.
    await seedAggregate('number-bonds', 0.95);
    const onExit = jest.fn();
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    // Bypass the real checking pipeline: force a 'correct' resolution so the
    // feedback panel renders deterministically regardless of the generated task.
    jest.spyOn(controller, 'submit').mockResolvedValue({ kind: 'correct', xpAwarded: 10 });

    const { getByTestId, findByTestId } = render(
      <ThemeProvider>
        <TaskScreen
          nodeId="number-bonds"
          controller={controller}
          onExit={onExit}
          onNavigate={jest.fn()}
        />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('task-screen')).toBeTruthy());
    // Submit via the number keypad's confirm button (mastered abstract band → NumberWidget).
    fireEvent.press(getByTestId('confirm-button'));

    // The feedback's continue action must route to the node map (onExit), not
    // generate another same-node task.
    fireEvent.press(await findByTestId('task-feedback-continue'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('recaps an already-solved step (🍎 = value) while the next step is answered', async () => {
    // Aggregate 0.5 selects fruit-equations band 1 (2 unknowns → 2 sequential steps).
    await seedAggregate('fruit-equations', 0.5);
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const { getByTestId, getByLabelText, queryByTestId, findByText } = render(
      <ThemeProvider>
        <TaskScreen
          nodeId="fruit-equations"
          controller={controller}
          onExit={jest.fn()}
          onNavigate={jest.fn()}
        />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('task-screen')).toBeTruthy());
    // No recap before the first answer is given.
    expect(queryByTestId('step-recap')).toBeNull();

    // Answer step 1 (🍎) with a value via the pictorial tokens palette.
    fireEvent.press(getByLabelText('2'));
    fireEvent.press(getByTestId('confirm-button'));

    // While step 2 (🍌) is being answered, the 🍎 value must be shown for reuse.
    await expect(findByText('🍎 = 2')).resolves.toBeTruthy();
  });

  it('renders a calm all-caught-up view for an unknown nodeId rather than throwing', async () => {
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const { findByText } = render(
      <ThemeProvider>
        <TaskScreen
          nodeId="not-a-real-node"
          controller={controller}
          onExit={jest.fn()}
          onNavigate={jest.fn()}
        />
      </ThemeProvider>
    );

    await expect(findByText('Молодець! Поки що все опрацьовано. 🎉')).resolves.toBeTruthy();
  });

  it('mounts a correctly-configured NumberWidget slot for a multi-slot node (fraction-simplification, abstract band) — regression for the multi-slot widget-config mismatch (Phase 6 review Must-fix)', async () => {
    // Aggregate 0.9 selects fraction-simplification's abstract band (>= 0.6 in
    // GRAPH_FIXTURE), which is a 'multi-slot' inputMode, AND crosses
    // DEFAULT_MASTERY_CONFIG.abstractFade (0.7) so finalOnly must be true too.
    await seedAggregate('fraction-simplification', 0.9);

    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const { getByTestId, getByText, queryByText } = render(
      <ThemeProvider>
        <TaskScreen
          nodeId="fraction-simplification"
          controller={controller}
          onExit={jest.fn()}
          onNavigate={jest.fn()}
        />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('task-screen')).toBeTruthy());
    await waitFor(() => expect(getByTestId('decimal-key')).toBeTruthy());

    // Before the fix, NumberWidget was fed the whole MultiSlotWidgetConfig cast
    // as a NumberWidgetConfig, so `decimalGlyph` was undefined and rendered the
    // literal text "undefined" on the keypad's decimal key.
    expect(queryByText('undefined')).toBeNull();
    // The decimal key must render the REAL uk decimal glyph (per-slot config).
    expect(getByText(',')).toBeTruthy();
    // `finalOnly` (mastery-fade speed-drill scaffolding) must reach the widget
    // — it was previously always undefined/falsy for multi-slot tasks. The
    // finalOnly header now renders the resolved i18n label (uk default catalog).
    expect(getByText('Введи відповідь')).toBeTruthy();
  });
});
