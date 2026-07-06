/**
 * check-types.ts — CheckResult 3-outcome union and FailedStep contract.
 *
 * CONTRACT INVARIANTS:
 *
 *   'correct' — all steps matched; no skillNode needed.
 *
 *   'parse-error' — the learner's input could not be parsed as a number.
 *     ANTI-SHAME: carries NO skillNode — structurally incapable of becoming a
 *     routing event. A formatting slip is not a skill failure. The UI shows a
 *     gentle format-hint (stage-06 i18n); no firehose event is emitted.
 *
 *   'failed-step' — the learner's normalized input did not match step.expected
 *     at some step index. failedStep.skillNode is the stage-04 routing entry
 *     point: "which skill caused the first-break?"
 *
 * SEAM DISCIPLINE:
 *   checkAnswer() is the only consumer of this union. Stage-04 reads
 *   CheckResult.failedStep.skillNode for diagnostic routing.
 *   Stage-06 reads CheckResult.outcome + ParseError.kind for i18n copy.
 *
 * DEPENDENCY DIRECTION:
 *   @/checking → @/parsing (ParseError)
 *   @/checking → @/widgets (DiagnosticPayload)
 *   @/widgets does NOT import from @/checking (one-directional edge preserved).
 */

import type { NodeId } from '@/core/types';
import type { ParseError } from '@/parsing';
import type { DiagnosticPayload } from '@/widgets';

// Re-export for consumers that import from @/checking only.
export type { ParseError };
export type { DiagnosticPayload };

// ---------------------------------------------------------------------------
// FailedStep — the stage-04 routing entry point
// ---------------------------------------------------------------------------

/**
 * FailedStep — the payload carried by a 'failed-step' CheckResult.
 *
 * skillNode is the stage-04 routing entry point: the skill-graph node whose
 * step produced the first-break mismatch. Stage-04 uses this to route the
 * learner back to the prerequisite that needs reinforcement.
 *
 * expected and received are both CANONICAL strings (output of canonicalize()).
 * Comparison is exact string equality: received !== expected → this FailedStep.
 * Neither is a raw locale-formatted string.
 *
 * diagnostic is optional: present only when the originating WidgetOutput
 * carried a DiagnosticPayload (choice/tokens widgets only). Stage-06 may use
 * it for targeted hints; it is NEVER shown as a shaming label.
 */
export interface FailedStep {
  /** Index (0-based) of the first step where the learner's answer did not match. */
  readonly stepIndex: number;
  /**
   * The skill-graph node this step exercises.
   * Stage-04 routing entry point: route the learner to this node's prerequisites.
   */
  readonly skillNode: NodeId;
  /** Canonical string of the expected answer (as produced by canonicalize()). */
  readonly expected: string;
  /**
   * Canonical string of the received answer. For integer/decimal steps, produced
   * by `canonicalize(parseLocaleNumber(rawInput, profile).value)`; for fraction
   * steps (numberClass 'fraction'), produced by
   * `canonicalizeFraction(parsedNum, parsedDen)` where each slot is independently
   * parsed via `parseLocaleNumber`. Never the raw locale-formatted glyph string.
   */
  readonly received: string;
  /**
   * Optional widget-specific routing signal. Present only when the originating
   * WidgetOutput carried a DiagnosticPayload (choice/tokens widgets).
   * Stage-06 may use this for targeted i18n hints. Never a shaming display.
   */
  readonly diagnostic?: DiagnosticPayload;
}

// ---------------------------------------------------------------------------
// CheckResult — 3-outcome discriminated union
// ---------------------------------------------------------------------------

/**
 * CheckResult — the discriminated 3-outcome union returned by checkAnswer().
 *
 * Outcomes:
 *   'correct'     — all steps matched; learner answered correctly.
 *   'parse-error' — the learner's rawInput at stepIndex could not be parsed.
 *                   NO skillNode (structurally non-routable). Non-scoring.
 *                   checkAnswer() emits ZERO firehose events for this outcome.
 *   'failed-step' — first-break mismatch at stepIndex; failedStep carries the
 *                   stage-04 routing signal (skillNode, expected, received).
 *                   checkAnswer() emits exactly one 'answer' firehose event.
 *
 * NOTE: 'parse-error' carries NO stepIndex at the top level intentionally —
 * the error object carries rawInput which is the relevant signal. The ParseError
 * kind field is the stage-06 i18n dispatch key.
 */
export type CheckResult =
  | { readonly outcome: 'correct' }
  | {
      readonly outcome: 'parse-error';
      /** The structured parse failure — kind + rawInput, no skillNode. */
      readonly error: ParseError;
    }
  | {
      readonly outcome: 'failed-step';
      /** The first-break step mismatch, carrying the stage-04 routing entry point. */
      readonly failedStep: FailedStep;
    };
