/**
 * Barrel for the spaced-repetition sub-system.
 *
 * This is the single import surface for all consumers of the spaced-repetition
 * seam (Seam A). Consumers MUST import from '@/core/spaced-repetition' (or from
 * '@/core' when re-exported there), never from sub-modules directly.
 *
 * WHAT IS EXPORTED:
 *   - Pure scheduler: `scheduleReview`, `ReviewOutcome`, `ScheduledFields`,
 *     `SchedulerConfig`
 *   - Persistence write-path: `applyScheduledReview` (thin impure boundary)
 *   - Metrics helpers: `seedSpacedRepetition`, `parseSpacedRepetition`,
 *     `serializeSpacedRepetition`, `toReviewItem`
 *   - Metrics types: `SpacedRepetitionSlice`, `ReviewItem`
 *   - Config (convenience re-export): `SR_POLICY`, `SpacedRepetitionConfig`,
 *     `resolveSpacedRepetitionConfig`
 *
 * WHAT IS NOT EXPORTED:
 *   - Internal helpers (e.g. `deriveDisposition`, `extractSpacedRepetitionSlice`)
 */

// ---------------------------------------------------------------------------
// Pure scheduler
// ---------------------------------------------------------------------------

export { scheduleReview } from './scheduler';
export type { ReviewOutcome, ScheduledFields, SchedulerConfig } from './scheduler';

// ---------------------------------------------------------------------------
// Metrics helpers and types
// ---------------------------------------------------------------------------

export {
  seedSpacedRepetition,
  parseSpacedRepetition,
  serializeSpacedRepetition,
  toReviewItem,
} from './scheduler-metrics';

export type { SpacedRepetitionSlice, ReviewItem } from './scheduler-metrics';

// ---------------------------------------------------------------------------
// Persistence write-path (thin impure boundary over the pure scheduler seam)
// ---------------------------------------------------------------------------

export { applyScheduledReview } from './apply-review';

// ---------------------------------------------------------------------------
// Config (convenience re-exports from @/config/spaced-repetition)
// ---------------------------------------------------------------------------

export { SR_POLICY, resolveSpacedRepetitionConfig } from '@/config/spaced-repetition';
export type { SpacedRepetitionConfig } from '@/config/spaced-repetition';
