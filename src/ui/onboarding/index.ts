/**
 * Public barrel for the @/ui/onboarding module.
 *
 * Phase 2 (stage 07) surface: the pure placement-seed function and the
 * RN-free `PlacementController` seam. Phase 3 added the static onboarding
 * screens (`WelcomeScreen`, `LanguageScreen`, `PersonaScreen`, `DoneScreen`)
 * and the `OnboardingFlow` orchestrator (with a Phase-3 placement
 * placeholder). Phase 4 adds the real `PlacementScreen` (driving
 * `PlacementController`) and wires it into `OnboardingFlow` in place of the
 * placeholder — the full Welcome → Language → Persona → Placement → Done
 * flow is now assembled.
 */

export { buildPlacementSeed } from './placement-seed';
export type { ProbeOutcome, PlacementController } from './placement-controller';
export { createPlacementController } from './placement-controller';

export { WelcomeScreen } from './WelcomeScreen';
export type { WelcomeScreenProps } from './WelcomeScreen';

export { LanguageScreen } from './LanguageScreen';
export type { LanguageScreenProps } from './LanguageScreen';

export { PersonaScreen } from './PersonaScreen';
export type { PersonaScreenProps } from './PersonaScreen';

export { PlacementScreen } from './PlacementScreen';
export type { PlacementScreenProps } from './PlacementScreen';

export { DoneScreen } from './DoneScreen';
export type { DoneScreenProps } from './DoneScreen';

export { OnboardingFlow } from './OnboardingFlow';
export type { OnboardingFlowProps } from './OnboardingFlow';
