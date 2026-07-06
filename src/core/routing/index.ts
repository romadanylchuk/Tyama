/**
 * src/core/routing/index.ts — Public barrel for the @/core/routing module.
 *
 * Exports the pure routing function and all associated types.
 * Consumers should import from '@/core/routing' or '@/core' — never from
 * sub-modules directly.
 *
 * PURITY GUARANTEE:
 *   All exports from this module are pure (no DB, no clock, no I/O).
 *   The `route()` function is the only export that produces a `RoutingDecision`;
 *   the type exports are pure data contracts.
 *
 * SEAM DISCIPLINE:
 *   `route()` is the single routing seam. Do not introduce a competing seam.
 *   The `AntiLoopMemory` is session-scoped and must be created fresh per session
 *   via `createAntiLoopMemory()`.
 */

// ---------------------------------------------------------------------------
// Pure routing function
// ---------------------------------------------------------------------------

export { route } from './route';

// ---------------------------------------------------------------------------
// Types and constructors
// ---------------------------------------------------------------------------

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
} from './routing-types';

export { createAntiLoopMemory } from './routing-types';
