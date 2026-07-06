/**
 * AppShell.test.tsx — startup-resilience test for the top-level shell
 * (Stage 06, Phase 6 — final-check Should #1 fix), extended (Stage 07,
 * Phase 3) with the first-run onboarding gate and the onboarding-seeded
 * `currentNodeId` entry-node honoring.
 *
 * Covers the anti-shame startup invariant: a DB-read rejection inside
 * `computeEntryNode` must NEVER strand the learner on the loading spinner.
 * The shell degrades calmly to the node map (the same "nothing proposable"
 * path taken when no entry node is found) instead of hanging on
 * <LoadingChrome> forever.
 *
 * The failure is injected at the `@/repositories` barrel (which AppShell reads
 * `getDueNodes` from). The mock DEFAULTS to the real implementation (so the
 * new onboarding-gate/entry-node tests exercise genuine repository behavior
 * against the in-memory test DB) and only the resilience test below
 * overrides it to reject, via `jest.requireMock` + `mockImplementation` in a
 * per-test scope (module-factory scope rules forbid closing over a plain
 * out-of-scope variable here — see `__mocks__/expo-file-system.js` for the
 * same established pattern).
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import { useTestDb } from '../../../jest.setup';
import { settings } from '@/repositories/settings-repository';

jest.mock('@/repositories', () => {
  const actual = jest.requireActual('@/repositories');
  return {
    ...actual,
    getDueNodes: jest.fn(actual.getDueNodes),
  };
});

import { getDueNodes } from '@/repositories';
import { AppShell } from '../AppShell';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
  // Default every test to a "returning learner" (onboarding already
  // complete) unless a test explicitly overrides — the onboarding gate
  // itself is covered by its own describe block below.
  await settings.set('onboardingComplete', true);
  (getDueNodes as jest.Mock).mockImplementation(jest.requireActual('@/repositories').getDueNodes);
});

describe('AppShell startup resilience', () => {
  it('falls back to the node map (never hangs on the spinner) when the entry-node DB read fails', async () => {
    // Silence the expected calm dev-diagnostic warning for a clean test log.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (getDueNodes as jest.Mock).mockImplementation(() =>
      Promise.reject(new Error('simulated DB read failure'))
    );

    const { getByTestId, queryByTestId } = render(<AppShell />);

    // The shell must resolve to the node map, not stay on the loading chrome.
    await waitFor(() => expect(getByTestId('node-map-screen')).toBeTruthy());
    expect(queryByTestId('app-shell-loading')).toBeNull();

    warnSpy.mockRestore();
  });
});

describe('AppShell — stage 07 onboarding gate', () => {
  it('renders the onboarding flow when onboardingComplete is false', async () => {
    await settings.set('onboardingComplete', false);

    const { getByTestId, queryByTestId } = render(<AppShell />);

    await waitFor(() => expect(getByTestId('onboarding-welcome-screen')).toBeTruthy());
    expect(queryByTestId('node-map-screen')).toBeNull();
    expect(queryByTestId('task-screen')).toBeNull();
  });

  it('skips onboarding straight into the main loop when onboardingComplete is true', async () => {
    // onboardingComplete=true is already set by the shared beforeEach.
    const { queryByTestId } = render(<AppShell />);

    await waitFor(() => {
      const enteredMainLoop =
        queryByTestId('node-map-screen') ??
        queryByTestId('task-screen') ??
        queryByTestId('task-screen-loading');
      expect(enteredMainLoop).toBeTruthy();
    });
    expect(queryByTestId('onboarding-welcome-screen')).toBeNull();
  });

  it('honors an onboarding-seeded currentNodeId as the entry node', async () => {
    await settings.set('currentNodeId', 'fruit-equations');

    const { getByTestId } = render(<AppShell />);

    await waitFor(() => expect(getByTestId('task-screen')).toBeTruthy());
    expect(getByTestId('mastery-ring-fruit-equations')).toBeTruthy();
  });
});
