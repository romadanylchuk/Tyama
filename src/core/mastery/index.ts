/**
 * src/core/mastery/index.ts — Public barrel for the @/core/mastery module.
 *
 * This barrel is the single import surface for all consumers of the mastery
 * sub-system (session layer, tests, stage-05/06 code).
 *
 * SEAM DISCIPLINE:
 *   All mastery logic is behind thin contracts. Consumers should import from
 *   '@/core/mastery' (this barrel) or '@/core' (the top-level core barrel),
 *   not from sub-module paths directly.
 *
 * WHAT IS EXPORTED:
 *   Config        — MasteryConfig, MasteryConfigOverride, DEFAULT_MASTERY_CONFIG,
 *                   resolveMasteryConfig
 *   Metrics types — MasterySlice, MasteryMetrics
 *   Metrics ops   — parseMasteryMetrics, seedMasteryMetrics, serializeMasteryMetrics
 *   Engine        — speedFactor, levelCeiling, rawAttemptScalar, combineWindow,
 *                   pushAttempt, aggregateOf
 *   Seam          — ingestAttempt, AttemptOutcome, AttemptRecord
 *   Lookup        — makeMasteryLookup
 *
 * WHAT IS NOT EXPORTED:
 *   - Internal implementation details (e.g. resolveConfig helper in ingest-attempt)
 *   - MasteryLookup, MasterySnapshot types live in @/core/routing/routing-types and
 *     are re-exported via @/core/routing (or @/core) — not duplicated here.
 */

// ---------------------------------------------------------------------------
// Config (config-as-data — all thresholds/ceilings/targets)
// ---------------------------------------------------------------------------

export {
  DEFAULT_MASTERY_CONFIG,
  resolveMasteryConfig,
} from './mastery-config';

export type {
  MasteryConfig,
  MasteryConfigOverride,
} from './mastery-config';

// ---------------------------------------------------------------------------
// Metrics types and pure helpers
// ---------------------------------------------------------------------------

export {
  seedMasteryMetrics,
  parseMasteryMetrics,
  serializeMasteryMetrics,
} from './mastery-metrics';

export type {
  MasterySlice,
  MasteryMetrics,
} from './mastery-metrics';

// ---------------------------------------------------------------------------
// Pure scalar engine
// ---------------------------------------------------------------------------

export {
  speedFactor,
  levelCeiling,
  rawAttemptScalar,
  combineWindow,
  pushAttempt,
  aggregateOf,
  masteryAttemptCount,
  isMasteryComplete,
} from './mastery-engine';

// ---------------------------------------------------------------------------
// ingestAttempt seam (persistence-touching)
// ---------------------------------------------------------------------------

export { ingestAttempt } from './ingest-attempt';

export type {
  AttemptOutcome,
  AttemptRecord,
} from './ingest-attempt';

// ---------------------------------------------------------------------------
// MasteryLookup builder (read-only; session-layer builds from getProgress)
// ---------------------------------------------------------------------------

export { makeMasteryLookup } from './mastery-lookup';
