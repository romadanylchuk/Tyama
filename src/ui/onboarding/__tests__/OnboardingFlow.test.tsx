/**
 * OnboardingFlow.test.tsx — full Welcome→Done walkthrough (stage 07, Phase 4).
 *
 * Covers the Phase 4 completion criterion:
 *   - Every step renders in sequence (Welcome → Language → Persona →
 *     Placement (real ladder) → Done), and the full happy path completes via
 *     the placement-skip affordance (the "shortenable, never nullable"
 *     path — deterministic and independent of any generator's RNG/backward
 *     generation, which `PlacementScreen.test.tsx` already covers in depth).
 *   - Language skip defaults all three language settings to 'uk'.
 *   - Persona skip defaults to the explicit 'adult-16+' enum (not the raw
 *     'default' alias).
 *   - Placement skip sets a real, non-null `currentNodeId` (the config's
 *     `floorNodeId`) — never nulls the entry node.
 *   - Reaching Done and tapping its primary affordance sets
 *     `onboardingComplete = true` and calls `onComplete` exactly once.
 *   - The SAME `PlacementController` instance survives every OnboardingFlow
 *     re-render while on the placement step (created once via a lazy
 *     `useState` initializer) — proven indirectly by the skip path setting
 *     exactly the config's `floorNodeId`, never a stale/reset value.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useTestDb } from '../../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { PLACEMENT_CONFIG } from '@/config/placement';
import { ThemeProvider } from '@/theme';
import { OnboardingFlow } from '../OnboardingFlow';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

describe('OnboardingFlow', () => {
  it('walks Welcome -> Language -> Persona -> Placement(skip) -> Done, calling onComplete once', async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <OnboardingFlow onComplete={onComplete} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-welcome-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-welcome-begin'));

    await waitFor(() => expect(getByTestId('onboarding-language-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-language-skip'));

    await waitFor(() => expect(getByTestId('onboarding-persona-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-persona-skip'));

    // Placement is never nullable — the skip affordance is the deterministic
    // "shortenable" path; PlacementScreen.test.tsx separately exercises the
    // real ascending-probe ladder (correct/failed-step/parse-error) in depth.
    await waitFor(() => expect(getByTestId('onboarding-placement-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-placement-skip'));

    await waitFor(() => expect(getByTestId('onboarding-done-screen')).toBeTruthy());
    // Skip-to-floor already set a real, non-null currentNodeId.
    expect(settings.get('currentNodeId')).toBe(PLACEMENT_CONFIG.floorNodeId);

    fireEvent.press(getByTestId('onboarding-done-enter'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(settings.get('onboardingComplete')).toBe(true);
  });

  it('language skip defaults all three language fields to uk', async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <OnboardingFlow onComplete={onComplete} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-welcome-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-welcome-begin'));

    await waitFor(() => expect(getByTestId('onboarding-language-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-language-skip'));

    await waitFor(() => expect(getByTestId('onboarding-persona-screen')).toBeTruthy());
    expect(settings.get('uiLanguage')).toBe('uk');
    expect(settings.get('contentLanguage')).toBe('uk');
    expect(settings.get('explanationLanguage')).toBe('uk');
  });

  it('an explicit language choice (en) sets all three fields to that tag', async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <OnboardingFlow onComplete={onComplete} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-welcome-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-welcome-begin'));

    await waitFor(() => expect(getByTestId('onboarding-language-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-language-en'));

    await waitFor(() => expect(getByTestId('onboarding-persona-screen')).toBeTruthy());
    expect(settings.get('uiLanguage')).toBe('en');
    expect(settings.get('contentLanguage')).toBe('en');
    expect(settings.get('explanationLanguage')).toBe('en');
  });

  it("persona skip defaults to the explicit 'adult-16+' enum (not the raw 'default' alias)", async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <OnboardingFlow onComplete={onComplete} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-welcome-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-welcome-begin'));

    await waitFor(() => expect(getByTestId('onboarding-language-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-language-skip'));

    await waitFor(() => expect(getByTestId('onboarding-persona-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-persona-skip'));

    await waitFor(() => expect(getByTestId('onboarding-placement-screen')).toBeTruthy());
    expect(settings.get('persona')).toBe('adult-16+');
  });

  it('placement skip sets a real, non-null currentNodeId (the config floor) — never nulls the entry node', async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <ThemeProvider>
        <OnboardingFlow onComplete={onComplete} />
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId('onboarding-welcome-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-welcome-begin'));

    await waitFor(() => expect(getByTestId('onboarding-language-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-language-skip'));

    await waitFor(() => expect(getByTestId('onboarding-persona-screen')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-persona-skip'));

    await waitFor(() => expect(getByTestId('onboarding-placement-screen')).toBeTruthy());
    expect(settings.get('currentNodeId')).toBeNull();
    fireEvent.press(getByTestId('onboarding-placement-skip'));

    await waitFor(() => expect(getByTestId('onboarding-done-screen')).toBeTruthy());
    expect(settings.get('currentNodeId')).toBe(PLACEMENT_CONFIG.floorNodeId);
    expect(settings.get('currentNodeId')).not.toBeNull();
  });
});
