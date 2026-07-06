/**
 * Public barrel for the @/navigation module (Stage 06, Phase 5).
 *
 * Re-exports the pure "where to next" priority merge (where-to-next.ts) and
 * the config-as-data curated entry path + its startup/CI guard
 * (curated-path.ts).
 */

export { whereToNext } from './where-to-next';
export type { NextSource, WhereToNext, WhereToNextResult, WhereToNextInput } from './where-to-next';

export { CURATED_ENTRY_PATH, validateCuratedPath } from './curated-path';
