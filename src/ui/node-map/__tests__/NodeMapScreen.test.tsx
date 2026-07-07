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
import { ThemeProvider } from '@/theme';
import { NodeMapScreen } from '../NodeMapScreen';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

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
