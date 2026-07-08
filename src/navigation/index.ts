/**
 * Public barrel for the @/navigation module (Stage 06, Phase 5).
 *
 * Re-exports the pure "where to next" priority merge (where-to-next.ts), the
 * config-as-data curated entry path + its startup/CI guard (curated-path.ts),
 * and the staleness-weighted self-check pick (self-check.ts).
 */

export { whereToNext } from './where-to-next';
export type { NextSource, WhereToNext, WhereToNextResult, WhereToNextInput } from './where-to-next';

export { CURATED_ENTRY_PATH, validateCuratedPath } from './curated-path';

export { pickSelfCheckNode, SELF_CHECK_STALENESS_CAP_MS } from './self-check';
export type { SelfCheckCandidate } from './self-check';
