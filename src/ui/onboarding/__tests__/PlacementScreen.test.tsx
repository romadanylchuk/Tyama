/**
 * PlacementScreen.test.tsx — the real ascending placement ladder screen
 * (stage 07, Phase 4).
 *
 * DETERMINISM STRATEGY:
 *   `PlacementScreen` drives `getGenerator(node).generate(difficulty, rng)`
 *   with a `Date.now()`-seeded RNG — exactly like `TaskScreen` does. Rather
 *   than fighting that non-determinism (or the backward-generation math of
 *   the real generators), this suite mocks `@/core/generators/registry`'s
 *   `getGenerator` to return a tiny stub `Generator` per node whose single
 *   step has a KNOWN `expected` value. This tests PlacementScreen's OWN
 *   orchestration (widget mounting, checkAnswer → ProbeOutcome translation,
 *   controller driving, calm framing) — never reimplementing or bypassing
 *   the real `checkAnswer`/`PlacementController` seams themselves, both of
 *   which run for real against the stub task.
 *
 * Covers the Phase 4 completion criterion:
 *   - A correct probe → ascend; the ladder's natural completion calls
 *     `onDone` with a real, non-null entry node; both probed nodes are
 *     seeded (`aggregate <= abstractFade`, never milestoned).
 *   - A wrong (failed-step) probe → the ladder stops; calm staged-descent
 *     framing (`descent.header`/`descent.body`) is shown — never a
 *     verdict/red/wrong surface; `Continue` finishes with the STOPPED node
 *     as the entry node.
 *   - A parse-error → the SAME probe is re-prompted (gentle re-prompt copy,
 *     `hint.formatHeader` + `parse.<kind>`), never consumed, nothing written.
 *   - Skip → `onSkip` fires (never `onDone` directly); the real
 *     `OnboardingFlow` wires this to `controller.skipToFloor()`.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useTestDb } from '../../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { getProgress } from '@/repositories/progress-repository';
import { parseMasteryMetrics } from '@/core/mastery/mastery-metrics';
import { DEFAULT_MASTERY_CONFIG } from '@/core/mastery/mastery-config';
import { canonicalize, SCALAR_INTEGER_POLICY } from '@/core/canonical';
import { ThemeProvider } from '@/theme';
import type { Generator, GeneratedTask, NodeId } from '@/core/types';
import type { PlacementConfig } from '@/config/placement';
import { PlacementScreen } from '../PlacementScreen';
import { createPlacementController } from '../placement-controller';
import { getGenerator } from '@/core/generators/registry';

jest.mock('@/core/generators/registry', () => {
  const actual = jest.requireActual('@/core/generators/registry');
  return { ...actual, getGenerator: jest.fn() };
});

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
  (getGenerator as jest.Mock).mockReset();
});

/** A tiny, fully-controlled single-step Generator stub: known `expected`. */
function stubGenerator(nodeId: NodeId, expected: string): Generator {
  return {
    skillNode: nodeId,
    generate: (): GeneratedTask => ({
      problem: { prompt: { key: 'test.problem' }, representation: 'abstract' },
      solution: expected,
      steps: [
        {
          prompt: { key: 'test.step' },
          inputMode: 'number',
          expected,
          skillNode: nodeId,
          elicitFromMastery: 0.65,
          normalizationPolicy: SCALAR_INTEGER_POLICY,
        },
      ],
      representation: 'abstract',
      skillNode: nodeId,
    }),
    instantiate: (): unknown => ({}),
  };
}

const TEST_CONFIG: PlacementConfig = Object.freeze({
  probeCount: 2,
  minProbes: 1,
  ascentChain: Object.freeze(['number-bonds', 'fruit-equations']) as readonly NodeId[],
  floorNodeId: 'number-bonds',
  seedCoordinate: 0.65,
});

const EXPECTED_A = canonicalize(7);
const EXPECTED_B = canonicalize(4);

function pressDigits(getByText: (text: string) => unknown, digits: string): void {
  for (const ch of digits) {
    fireEvent.press(getByText(ch) as never);
  }
}

describe('PlacementScreen', () => {
  it('renders the calm low-stakes intro before any probe, with Skip available', async () => {
    const controller = createPlacementController(TEST_CONFIG);
    const onDone = jest.fn();
    const onSkip = jest.fn(async () => {});
    const { getByTestId } = render(
      <ThemeProvider>
        <PlacementScreen controller={controller} onDone={onDone} onSkip={onSkip} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-placement-screen')).toBeTruthy());
    expect(getByTestId('onboarding-placement-begin')).toBeTruthy();
    expect(getByTestId('onboarding-placement-skip')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('two correct probes ascend and seed both nodes, then finish with a real, non-null entry node', async () => {
    (getGenerator as jest.Mock).mockImplementation((nodeId: NodeId) => {
      if (nodeId === 'number-bonds') return stubGenerator(nodeId, EXPECTED_A);
      if (nodeId === 'fruit-equations') return stubGenerator(nodeId, EXPECTED_B);
      return undefined;
    });

    const controller = createPlacementController(TEST_CONFIG);
    const onDone = jest.fn();
    const onSkip = jest.fn(async () => {});
    const { getByTestId, getByText } = render(
      <ThemeProvider>
        <PlacementScreen controller={controller} onDone={onDone} onSkip={onSkip} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-placement-begin')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-placement-begin'));

    // Probe 1 (number-bonds) — correct.
    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    pressDigits(getByText, EXPECTED_A);
    fireEvent.press(getByTestId('confirm-button'));

    // Probe 2 (fruit-equations) — correct; ladder finishes naturally.
    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    pressDigits(getByText, EXPECTED_B);
    fireEvent.press(getByTestId('confirm-button'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const entryNode = onDone.mock.calls[0][0];
    expect(entryNode).toBe('fruit-equations');
    expect(settings.get('currentNodeId')).toBe('fruit-equations');

    for (const nodeId of ['number-bonds', 'fruit-equations']) {
      const row = await getProgress(nodeId);
      expect(row).not.toBeNull();
      const { mastery } = parseMasteryMetrics(row?.metrics ?? '');
      expect(mastery.aggregate).toBeGreaterThan(0);
      expect(mastery.aggregate).toBeLessThan(DEFAULT_MASTERY_CONFIG.masteryThreshold);
    }
  });

  it('a wrong probe stops the ladder with calm staged-descent framing (never a verdict), then finishes at the stopped node', async () => {
    (getGenerator as jest.Mock).mockImplementation((nodeId: NodeId) => stubGenerator(nodeId, EXPECTED_A));

    const controller = createPlacementController(TEST_CONFIG);
    const onDone = jest.fn();
    const onSkip = jest.fn(async () => {});
    const { getByTestId, getByText, queryByText } = render(
      <ThemeProvider>
        <PlacementScreen controller={controller} onDone={onDone} onSkip={onSkip} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-placement-begin')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-placement-begin'));

    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    // A digit that does NOT match EXPECTED_A -> failed-step (mirrors
    // session-controller.test.ts's own "wrong answer" convention).
    pressDigits(getByText, '1');
    fireEvent.press(getByTestId('confirm-button'));

    await waitFor(() => expect(getByTestId('onboarding-placement-stopped')).toBeTruthy());
    expect(queryByText(/wrong/i)).toBeNull();
    expect(queryByText(/fail/i)).toBeNull();
    expect(queryByText('✗')).toBeNull();

    // The failing node was never seeded.
    expect(await getProgress('number-bonds')).toBeNull();

    fireEvent.press(getByTestId('onboarding-placement-stopped-continue'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0]).toBe('number-bonds');
    expect(settings.get('currentNodeId')).toBe('number-bonds');
  });

  it('a parse-error gently re-prompts the SAME probe without consuming it or writing anything', async () => {
    (getGenerator as jest.Mock).mockImplementation((nodeId: NodeId) => stubGenerator(nodeId, EXPECTED_A));

    const controller = createPlacementController(TEST_CONFIG);
    const onDone = jest.fn();
    const onSkip = jest.fn(async () => {});
    const { getByTestId, getByText, queryByText } = render(
      <ThemeProvider>
        <PlacementScreen controller={controller} onDone={onDone} onSkip={onSkip} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-placement-begin')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-placement-begin'));

    // Confirm with NO digits entered -> ParseError('empty').
    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    fireEvent.press(getByTestId('confirm-button'));

    await waitFor(() => expect(getByTestId('onboarding-placement-parse-hint')).toBeTruthy());
    // Gentle format-hint framing only — never a wrong/red/cross surface.
    expect(queryByText(/wrong/i)).toBeNull();
    expect(queryByText('✗')).toBeNull();
    expect(await getProgress('number-bonds')).toBeNull();

    fireEvent.press(getByTestId('onboarding-placement-parse-continue'));

    // Back to the SAME probe (number-bonds) — typing the correct digit now
    // succeeds, proving the probe was re-collected, not skipped or consumed.
    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    pressDigits(getByText, EXPECTED_A);
    fireEvent.press(getByTestId('confirm-button'));

    // Second probe (fruit-equations) is now presented.
    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    expect(await getProgress('number-bonds')).not.toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Skip calls onSkip and never calls onDone directly', async () => {
    const controller = createPlacementController(TEST_CONFIG);
    const onDone = jest.fn();
    const onSkip = jest.fn(async () => {});
    const { getByTestId } = render(
      <ThemeProvider>
        <PlacementScreen controller={controller} onDone={onDone} onSkip={onSkip} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-placement-skip')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-placement-skip'));

    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
  });
});
