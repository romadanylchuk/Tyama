/**
 * Public barrel for the @/ui module (Stage 06, Phase 6; onboarding surface
 * added Stage 07, Phase 3).
 *
 * Re-exports the node-map layout + screen, the task-screen widget-config
 * synthesis + session orchestration + screen, the onboarding flow, and the
 * top-level `AppShell`.
 */

export { layoutNodes } from './node-map/node-layout';
export type { NodeLayoutEntry, CompanionSlot, NodeMapLayout } from './node-map/node-layout';

export { NodeMapScreen } from './node-map/NodeMapScreen';
export type { NodeMapScreenProps } from './node-map/NodeMapScreen';

export { buildWidgetConfig } from './task-screen/build-widget-config';

export { SessionController } from './task-screen/session-controller';
export type { SessionViewEvent, SubmitInput, SessionControllerOptions } from './task-screen/session-controller';

export { TaskScreen } from './task-screen/TaskScreen';
export type { TaskScreenProps } from './task-screen/TaskScreen';

export {
  buildPlacementSeed,
  createPlacementController,
  WelcomeScreen,
  LanguageScreen,
  PersonaScreen,
  PlacementScreen,
  DoneScreen,
  OnboardingFlow,
} from './onboarding';
export type {
  ProbeOutcome,
  PlacementController,
  WelcomeScreenProps,
  LanguageScreenProps,
  PersonaScreenProps,
  PlacementScreenProps,
  DoneScreenProps,
  OnboardingFlowProps,
} from './onboarding';

export { AppShell } from './AppShell';
