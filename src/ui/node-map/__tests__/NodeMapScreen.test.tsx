/**
 * NodeMapScreen.test.tsx — thin render test for the node map (Stage 06, Phase 6).
 *
 * Covers the Phase 6 completion criterion:
 *   - Renders under <ThemeProvider> without throwing.
 *   - A 'not-yet-open' (coming-soon) node renders inert — no padlock glyph,
 *     no "locked" wording anywhere on screen.
 *   - The reserved companion-slot region is present.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useTestDb } from '../../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { upsertNonMilestoneProgress, readAllFirehose } from '@/repositories';
import { serializeMasteryMetrics } from '@/core/mastery/mastery-metrics';
import { ThemeProvider } from '@/theme';
import { NodeMapScreen } from '../NodeMapScreen';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

/**
 * Seeds a node as mastered: aggregate 0.9 ≥ masteryThreshold (0.8) with a
 * 6-entry abstract window ≥ minMasteryAttempts (6) — the exact predicate
 * behind deriveRingState === 'mastered'.
 */
async function seedMastered(nodeId: string): Promise<void> {
  const w = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
  await upsertNonMilestoneProgress({
    nodeId,
    metrics: serializeMasteryMetrics(
      {},
      { slices: { abstract: { window: w, scalar: 0.9 } }, aggregate: 0.9 }
    ),
  });
}

describe('NodeMapScreen', () => {
  it('renders under ThemeProvider, shows a tile per graph node, and reserves the companion slot', async () => {
    const onSelectNode = jest.fn();
    const { getByTestId, queryByText } = render(
      <ThemeProvider>
        <NodeMapScreen onSelectNode={onSelectNode} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-screen')).toBeTruthy());
    // Every fixture node tile (available or coming-soon) renders inert, no padlock/locked wording.
    await waitFor(() => expect(getByTestId('node-map-tile-addition-within-20')).toBeTruthy());
    expect(queryByText(/locked/i)).toBeNull();
    expect(queryByText('🔒')).toBeNull();

    expect(getByTestId('node-map-companion-slot')).toBeTruthy();
  });

  it('an available node tile is tappable and invokes onSelectNode', async () => {
    const onSelectNode = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <NodeMapScreen onSelectNode={onSelectNode} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-tile-fruit-equations')).toBeTruthy());
    const tile = getByTestId('node-map-tile-fruit-equations');
    fireEvent.press(tile);
    expect(onSelectNode).toHaveBeenCalledWith('fruit-equations');
  });

  it('marks the recommended node and due-review nodes; unmarked otherwise', async () => {
    const { getByTestId, queryByTestId } = render(
      <ThemeProvider>
        <NodeMapScreen
          onSelectNode={jest.fn()}
          recommendedNodeId="fruit-equations"
          dueNodeIds={new Set(['number-bonds'])}
        />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-recommended-fruit-equations')).toBeTruthy());
    expect(getByTestId('node-map-due-number-bonds')).toBeTruthy();
    // Nodes outside the guidance carry no markers.
    expect(queryByTestId('node-map-recommended-number-bonds')).toBeNull();
    expect(queryByTestId('node-map-due-fruit-equations')).toBeNull();
  });

  it('renders an unmarked map when no guidance props are supplied', async () => {
    const { getByTestId, queryByTestId } = render(
      <ThemeProvider>
        <NodeMapScreen onSelectNode={jest.fn()} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-tile-fruit-equations')).toBeTruthy());
    expect(queryByTestId('node-map-recommended-fruit-equations')).toBeNull();
    expect(queryByTestId('node-map-due-fruit-equations')).toBeNull();
  });
});

describe('NodeMapScreen self-check ("Перевір себе")', () => {
  it('hides the self-check button while no node is mastered', async () => {
    const { getByTestId, queryByTestId } = render(
      <ThemeProvider>
        <NodeMapScreen onSelectNode={jest.fn()} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-tile-addition-within-20')).toBeTruthy());
    expect(queryByTestId('node-map-self-check')).toBeNull();
  });

  it('shows the button once a node is mastered; press launches that node and logs a firehose event', async () => {
    await seedMastered('multiplication');

    const onSelectNode = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <NodeMapScreen onSelectNode={onSelectNode} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-self-check')).toBeTruthy());
    fireEvent.press(getByTestId('node-map-self-check'));

    // Single mastered candidate → the pick is deterministic.
    await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith('multiplication'));

    await waitFor(async () => {
      const firehose = await readAllFirehose();
      const started = firehose.filter((e) => e.type === 'self_check_started');
      expect(started).toHaveLength(1);
      expect(JSON.parse(started[0].payload)).toEqual({ nodeId: 'multiplication' });
    });
  });

  it('picks one of the mastered nodes when several qualify', async () => {
    await seedMastered('multiplication');
    await seedMastered('fruit-equations');

    const onSelectNode = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <NodeMapScreen onSelectNode={onSelectNode} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-self-check')).toBeTruthy());
    fireEvent.press(getByTestId('node-map-self-check'));

    await waitFor(() => expect(onSelectNode).toHaveBeenCalledTimes(1));
    expect(['multiplication', 'fruit-equations']).toContain(onSelectNode.mock.calls[0][0]);
  });

  it('never re-serves the theme the learner just left when another mastered node exists', async () => {
    await seedMastered('multiplication');
    await seedMastered('fruit-equations');

    const onSelectNode = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <NodeMapScreen onSelectNode={onSelectNode} lastVisitedNodeId="multiplication" />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-self-check')).toBeTruthy());
    fireEvent.press(getByTestId('node-map-self-check'));

    // With 'multiplication' excluded, 'fruit-equations' is the only candidate.
    await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith('fruit-equations'));
  });

  it('allows a repeat when the just-left theme is the ONLY mastered node', async () => {
    await seedMastered('multiplication');

    const onSelectNode = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <NodeMapScreen onSelectNode={onSelectNode} lastVisitedNodeId="multiplication" />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('node-map-self-check')).toBeTruthy());
    fireEvent.press(getByTestId('node-map-self-check'));

    // A repeat beats a dead button — the tap still launches the node.
    await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith('multiplication'));
  });
});
