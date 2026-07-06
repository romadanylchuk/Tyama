/**
 * @/checking barrel — public surface of the step-level checking module.
 *
 * This is the single import surface for all consumers (stage-04 routing,
 * stage-06 presentation, tests).
 *
 * Exports:
 *   checkAnswer      — generic first-break checking engine (async)
 *   CheckResult      — 3-outcome discriminated union ('correct' | 'parse-error' | 'failed-step')
 *   FailedStep       — the stage-04 routing entry point (skillNode + canonical expected/received)
 *   DiagnosticPayload — re-exported from @/widgets (one-directional edge preserved)
 *   ParseError       — re-exported from @/parsing (structurally non-routable)
 *
 * Dependency direction:
 *   @/checking → @/parsing, @/widgets, @/core, @/repositories
 *   @/widgets does NOT import from @/checking.
 */

export { checkAnswer } from './check-answer';
export type { CheckResult, FailedStep } from './check-types';

// Re-exports for consumers that want a single import surface.
export type { DiagnosticPayload } from './check-types';
export type { ParseError } from './check-types';
