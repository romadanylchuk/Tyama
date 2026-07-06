/**
 * src/core/index.ts — Public barrel for the Tyama domain core.
 *
 * This barrel is the single import surface for all consumers of the core layer
 * (App.tsx, stage-03 checker, stage-04 router, stage-05 scheduler, tests).
 *
 * SEAM DISCIPLINE:
 *   All public functions exported here are behind thin contracts. Consumers
 *   must NOT import from sub-modules directly (e.g. do not import from
 *   '@/core/generators/registry' — import from '@/core' instead).
 *
 * WHAT IS EXPORTED:
 *   - Graph loading and validation (loadGraph, validateGraph, validateRegistry)
 *   - Generator registry (getGenerator, hasGenerator, resolveAvailability,
 *     assertEveryGeneratorHasNode, GENERATORS)
 *   - Difficulty selection (selectBand)
 *   - Seeded RNG (createSeededRng)
 *   - Version reconciliation (reconcileGraphVersion, GRAPH_MIGRATIONS)
 *   - Canonical number (canonicalize, SCALAR_DECIMAL_POLICY, CANONICAL_NUMBER_STANDARD)
 *   - All contract types
 *
 * WHAT IS NOT EXPORTED:
 *   - Internal implementation details (e.g. GRAPH_FIXTURE, dfsVisit, mulberry32)
 *   - Error classes from sub-modules ARE exported (for instanceof checks in callers)
 */

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export { loadGraph } from './graph/load-graph';
export { validateGraph, GraphValidationError } from './graph/validate-graph';
export { reconcileGraphVersion, GRAPH_MIGRATIONS } from './graph/graph-version';

// ---------------------------------------------------------------------------
// Generator registry
// ---------------------------------------------------------------------------

export {
  GENERATORS,
  getGenerator,
  hasGenerator,
  resolveAvailability,
  assertEveryGeneratorHasNode,
  validateRegistry,
  AssertEveryGeneratorHasNodeError,
} from './generators/registry';

export type { NodeAvailability, NodeAvailabilityStatus } from './generators/registry';

// ---------------------------------------------------------------------------
// Difficulty selection
// ---------------------------------------------------------------------------

export { selectBand, validateBands, SelectBandError } from './difficulty/select-band';

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

export { createSeededRng } from './rng/seeded-rng';

// ---------------------------------------------------------------------------
// Canonical number
// ---------------------------------------------------------------------------

export {
  canonicalize,
  canonicalizeFraction,
  SCALAR_DECIMAL_POLICY,
  SCALAR_INTEGER_POLICY,
  CANONICAL_NUMBER_STANDARD,
  CanonicalError,
} from './canonical';

export type { NormalizationPolicy } from './canonical';

// ---------------------------------------------------------------------------
// Mastery sub-system (@/core/mastery)
// ---------------------------------------------------------------------------

export {
  DEFAULT_MASTERY_CONFIG,
  resolveMasteryConfig,
  seedMasteryMetrics,
  parseMasteryMetrics,
  serializeMasteryMetrics,
  speedFactor,
  levelCeiling,
  rawAttemptScalar,
  combineWindow,
  pushAttempt,
  aggregateOf,
  ingestAttempt,
  makeMasteryLookup,
} from './mastery';

export type {
  MasteryConfig,
  MasteryConfigOverride,
  MasterySlice,
  MasteryMetrics,
  AttemptOutcome,
  AttemptRecord,
} from './mastery';

// ---------------------------------------------------------------------------
// Routing sub-system (@/core/routing)
// ---------------------------------------------------------------------------

export { route, createAntiLoopMemory } from './routing';

export type {
  MasterySnapshot,
  MasteryLookup,
  RoutingReason,
  AntiLoopDirective,
  RoutingDecision,
  AntiLoopEntry,
  AntiLoopMemory,
  ReadonlyAntiLoopMemory,
  ExplanationContext,
} from './routing';

// ---------------------------------------------------------------------------
// Contract types (re-exported so consumers only need one import source)
// ---------------------------------------------------------------------------

export type {
  NodeId,
  RepresentationLevel,
  InputMode,
  LocalizedRef,
  PromptSpec,
  DifficultyParams,
  SeededRng,
  ProblemSpec,
  Step,
  GeneratedTask,
  Band,
  DifficultyHooks,
  GraphNode,
  GraphDefinition,
  Generator,
} from './types';
