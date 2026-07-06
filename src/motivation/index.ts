/**
 * Public barrel for the @/motivation module (Stage 06, Phase 4).
 *
 * Re-exports config-as-data defaults (motivation-config.ts), the pure
 * ring-state derivation (ring-state.ts), the pure streak/XP derivation +
 * consumer-safe emission helpers (streak-xp.ts), the read hooks
 * (useMastery.ts, useMotivation.ts), and the graded ring component
 * (MasteryRing.tsx).
 */

export { MIN_TASKS_FOR_KEPT_DAY, XP_AWARDS, DUE_REVIEW_SESSION_CAP } from './motivation-config';
export type { XpAwards } from './motivation-config';

export { deriveRingState } from './ring-state';
export type { RingState, RingStateResult } from './ring-state';

export {
  GLOBAL_MOTIVATION_NODE_ID,
  computeStreakDisplay,
  nextXp,
  recordKeptDaySession,
  awardXp,
  awardTaskCompletionXp,
  awardMasteryMilestoneXp,
} from './streak-xp';
export type { StreakConfig, KeptDaySessionResult } from './streak-xp';

export { useMastery } from './useMastery';
export type { UseMasteryResult } from './useMastery';

export { useMotivation } from './useMotivation';
export type { UseMotivationResult } from './useMotivation';

export { MasteryRing } from './MasteryRing';
export type { MasteryRingProps } from './MasteryRing';
