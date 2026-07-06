/**
 * OnboardingFlow.tsx — the first-run onboarding orchestrator (stage 07,
 * Phase 4: the full Welcome → Language → Persona → Placement → Done flow).
 *
 * ORCHESTRATES, OWNS NONE OF THE THREE CONCERNS:
 *   A local step state machine walks Welcome → Language → Persona →
 *   Placement → Done. Each step screen delegates to its own owner
 *   (`settings.set` / `i18n` / `useTheme().setPersona` / the Phase-2
 *   `PlacementController`) — this component holds no persistence writes of
 *   its own beyond advancing which screen is mounted.
 *
 * PLACEMENT CONTROLLER LIFETIME:
 *   `createPlacementController()` is called exactly ONCE per onboarding run
 *   (lazy `useState` initializer — NOT re-created on every re-render or step
 *   change), so the ladder's in-memory ascent index survives every
 *   `PlacementScreen` re-render while `step === 'placement'`. Both
 *   `PlacementScreen`'s `onDone` and its `onSkip` resolve to the SAME
 *   controller instance's `finish()` / `skipToFloor()` — either path always
 *   sets a real, non-null `settings.currentNodeId` before advancing to Done.
 *
 * `onComplete` bubbles once, from `DoneScreen`, to the caller (`AppShell`),
 * which re-computes the session's entry node (picking up the seeded
 * `currentNodeId` automatically — no `AppShell` change needed for this phase)
 * and transitions into the main loop.
 */

import React, { useCallback, useState } from 'react';

import { WelcomeScreen } from './WelcomeScreen';
import { LanguageScreen } from './LanguageScreen';
import { PersonaScreen } from './PersonaScreen';
import { PlacementScreen } from './PlacementScreen';
import { DoneScreen } from './DoneScreen';
import { createPlacementController, type PlacementController } from './placement-controller';

// ---------------------------------------------------------------------------
// OnboardingFlowProps
// ---------------------------------------------------------------------------

export interface OnboardingFlowProps {
  /** Called once, after `DoneScreen` persists `onboardingComplete = true`. */
  readonly onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Step — local routing state (no nav library, mirrors AppShell's own Screen)
// ---------------------------------------------------------------------------

type Step = 'welcome' | 'language' | 'persona' | 'placement' | 'done';

// ---------------------------------------------------------------------------
// OnboardingFlow
// ---------------------------------------------------------------------------

export function OnboardingFlow({ onComplete }: OnboardingFlowProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('welcome');
  // Created exactly ONCE per onboarding run (lazy initializer) — see the file
  // header. Re-creating this on every render would silently reset the
  // ladder's ascent index every time PlacementScreen re-renders.
  const [controller] = useState<PlacementController>(() => createPlacementController());

  const goToLanguage = useCallback((): void => setStep('language'), []);
  const goToPersona = useCallback((): void => setStep('persona'), []);
  const goToPlacement = useCallback((): void => setStep('placement'), []);
  const goToDone = useCallback((): void => setStep('done'), []);

  // `finish()` already ran inside PlacementScreen and set a real, non-null
  // `settings.currentNodeId` — this handler only advances the flow.
  const handlePlacementDone = useCallback((): void => {
    goToDone();
  }, [goToDone]);

  // Skip-to-floor is never a null entry node — `skipToFloor()` sets
  // `currentNodeId = floorNodeId` (the architecturally-fresh-learner default).
  const handlePlacementSkip = useCallback(async (): Promise<void> => {
    await controller.skipToFloor();
    goToDone();
  }, [controller, goToDone]);

  switch (step) {
    case 'welcome':
      return <WelcomeScreen onNext={goToLanguage} />;
    case 'language':
      return <LanguageScreen onNext={goToPersona} />;
    case 'persona':
      return <PersonaScreen onNext={goToPlacement} />;
    case 'placement':
      return (
        <PlacementScreen
          controller={controller}
          onDone={handlePlacementDone}
          onSkip={handlePlacementSkip}
        />
      );
    case 'done':
      return <DoneScreen onComplete={onComplete} />;
    default: {
      const _exhaustive: never = step;
      throw new Error(`[OnboardingFlow] unhandled step: ${_exhaustive as string}`);
    }
  }
}
