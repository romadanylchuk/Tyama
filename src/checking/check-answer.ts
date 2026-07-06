/**
 * check-answer.ts — The single generic first-break step-level checking engine.
 *
 * FIRST-BREAK SEMANTICS (DL-5):
 *   Steps are checked in order. The moment any step fails (parse-error or
 *   mismatch), checkAnswer() returns immediately — later steps are NOT
 *   evaluated. This avoids cascade noise from downstream steps that depend
 *   on an upstream answer.
 *
 * PER-STEP BRANCH ORDER (critical — parse-error precedes mismatch):
 *
 *   INTEGER/DECIMAL STEP (numberClass !== 'fraction'):
 *     1. parseLocaleNumber(output.rawInput, profile)
 *        → if !ok: return { outcome: 'parse-error', error } IMMEDIATELY.
 *          - ZERO firehose events emitted (total silence — anti-shame invariant).
 *     2. canonicalize(parsed.value) → received (canonical string)
 *        → if received !== step.expected: record FailedStep, return 'failed-step'.
 *          - ONE 'answer' firehose event emitted.
 *     Advances outputIndex by 1.
 *
 *   FRACTION STEP (numberClass === 'fraction'):
 *     Consumes TWO consecutive outputs: outputs[outputIndex] = numerator slot,
 *     outputs[outputIndex+1] = denominator slot.
 *     1. Parse numerator slot. If !ok → return parse-error immediately (zero firehose).
 *     2. Parse denominator slot. If !ok → return parse-error immediately (zero firehose).
 *     3. Detect denominator === 0 before calling canonicalizeFraction — a learner
 *        entering '0' in the denominator slot is a malformed entry (parse-error
 *        outcome, zero firehose), NOT a throw. This keeps canonicalizeFraction's
 *        den===0 throw strictly a programmer-error path.
 *     4. Detect non-integer values in either slot — a learner entering a decimal
 *        (e.g. '1.5' or '1,5' under UK locale) in a fraction slot successfully
 *        parses via parseLocaleNumber but would cause canonicalizeFraction to throw
 *        CanonicalError (its !Number.isInteger guard). Guard BOTH slots with
 *        !Number.isInteger before calling canonicalizeFraction, mirroring the den===0
 *        pattern. A decimal in a fraction slot is a malformed entry (parse-error
 *        outcome, zero firehose), NOT a throw. Anti-shame invariant: learner input
 *        must NEVER cause an unhandled throw from checkAnswer.
 *     5. received = canonicalizeFraction(parsedNum.value, parsedDen.value).
 *        Equivalent fractions match free: '2/4' and '1/2' both → '1/2'.
 *     6. If received !== step.expected → failed-step (one firehose row).
 *     Advances outputIndex by 2.
 *
 *   3. All steps matched → return { outcome: 'correct' }.
 *      - ONE 'answer' firehose event emitted.
 *
 * ACTIVE POLICY (stage-05 fraction folding live):
 *   step.normalizationPolicy.numberClass === 'fraction' activates the fraction
 *   fold branch (two slots → canonicalizeFraction). For 'integer' and 'decimal',
 *   the path is unchanged (canonicalize() sole number→string authority).
 *
 * CANONICAL-NUMBER SPINE:
 *   canonicalize() from @/core is the SOLE scalar number→string authority.
 *   canonicalizeFraction() from @/core is the SOLE fraction→string authority.
 *   This module must NEVER re-implement number formatting (no .toFixed, no
 *   .toLocaleString, no String(n) on a number). The no-adhoc-number-format ESLint
 *   rule does not cover @/checking, but the invariant is enforced by review.
 *
 * FIREHOSE POLICY (load-bearing anti-shame):
 *   - 'correct'     → emit appendFirehose('answer', { outcome: 'correct', skillNode, ... })
 *   - 'failed-step' → emit appendFirehose('answer', { outcome: 'failed-step', skillNode, stepIndex })
 *   - 'parse-error' → emit NOTHING (total silence — not even an 'error' event)
 *   NEVER call recordMilestone() from this module.
 *   NEVER emit an 'error'-typed firehose event.
 *
 * PROGRAMMER-ERROR GUARD (expected-width):
 *   A fraction step consumes 2 outputs; integer/decimal steps consume 1.
 *   outputs.length !== sum(stepWidth(s) for s in steps) is a programmer error.
 *   It throws synchronously before any processing.
 */

import { canonicalize, canonicalizeFraction } from '@/core/canonical';
import type { Step } from '@/core/types';
import { parseLocaleNumber } from '@/parsing';
import type { LocaleNumericProfile } from '@/parsing';
import { appendFirehose } from '@/repositories';
import type { WidgetOutput } from '@/widgets';
import type { CheckResult, FailedStep } from './check-types';

// ---------------------------------------------------------------------------
// stepWidth — width of a step in output slots
// ---------------------------------------------------------------------------

/**
 * stepWidth(step): 1 | 2
 *
 * Returns the number of consecutive WidgetOutputs consumed by this step:
 *   - 'fraction' step  → 2  (numerator slot, denominator slot)
 *   - 'integer'/'decimal' step → 1
 *
 * This is the SOLE place where step width is derived.
 */
function stepWidth(step: Step): 1 | 2 {
  return step.normalizationPolicy.numberClass === 'fraction' ? 2 : 1;
}

// ---------------------------------------------------------------------------
// checkAnswer — the single generic checking engine
// ---------------------------------------------------------------------------

/**
 * checkAnswer(steps, outputs, profile): Promise<CheckResult>
 *
 * Walks steps[] in order (first-break). For each step:
 *   - Integer/decimal: parse one output slot, canonicalize, compare.
 *   - Fraction: parse two consecutive output slots (numerator, denominator),
 *     detect denominator===0 as a parse-error before calling canonicalizeFraction,
 *     then fold to a canonical fraction via canonicalizeFraction and compare.
 *
 * The output index advances by stepWidth(step) per step (1 or 2).
 *
 * @param steps   - Ordered solution steps from a GeneratedTask.
 * @param outputs - Ordered learner outputs from the widget pipeline.
 * @param profile - The active locale numeric profile (from resolveLocaleProfile).
 * @returns         Promise<CheckResult> — the 3-outcome discriminated union.
 *
 * @throws {Error} If outputs.length !== expected total width (programmer error).
 */
export async function checkAnswer(
  steps: Step[],
  outputs: WidgetOutput[],
  profile: LocaleNumericProfile
): Promise<CheckResult> {
  // Programmer-error guard: expected-width check replaces the old 1:1 length guard.
  // A fraction step consumes 2 outputs; other steps consume 1.
  const expectedWidth = steps.reduce((n, s) => n + stepWidth(s), 0);
  if (outputs.length !== expectedWidth) {
    throw new Error(
      `[checkAnswer] outputs.length (${outputs.length}) !== expectedWidth (${expectedWidth}). ` +
        'Each integer/decimal Step consumes 1 WidgetOutput; each fraction Step consumes 2 ' +
        '(numerator slot, denominator slot). The widget pipeline must produce exactly the ' +
        'expected total width of outputs, positionally aligned. This is a programmer error, ' +
        'not a learner outcome.'
    );
  }

  // Output cursor advances by stepWidth(step) per step.
  let outputIndex = 0;

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];
    const width = stepWidth(step);

    if (width === 2) {
      // -----------------------------------------------------------------------
      // FRACTION FOLD BRANCH (numberClass === 'fraction')
      //
      // Two positionally-aligned slots: outputs[outputIndex] is the numerator,
      // outputs[outputIndex+1] is the denominator. Each is parsed independently
      // as an integer via parseLocaleNumber.
      //
      // ANTI-SHAME: a learner who enters a non-reduced-but-correct fraction
      // (e.g. '2' and '4' for an expected '1/2') is NEVER marked wrong —
      // canonicalizeFraction reduces, so '2/4' → '1/2' matches '1/2'.
      //
      // DENOMINATOR-ZERO: a learner entering '0' in the denominator slot is
      // treated as a parse-error (malformed entry), NOT a throw. We detect
      // parsedDen.value === 0 BEFORE calling canonicalizeFraction so the
      // function's den===0 throw stays strictly a programmer-error path.
      // -----------------------------------------------------------------------

      const numSlot = outputs[outputIndex];
      const denSlot = outputs[outputIndex + 1];

      // Parse numerator slot (first-break: any parse failure returns immediately).
      const parsedNum = parseLocaleNumber(numSlot.rawInput, profile);
      if (!parsedNum.ok) {
        // PARSE-ERROR: numerator slot unparseable. Zero firehose. Return immediately.
        return { outcome: 'parse-error', error: parsedNum.error };
      }

      // Parse denominator slot.
      const parsedDen = parseLocaleNumber(denSlot.rawInput, profile);
      if (!parsedDen.ok) {
        // PARSE-ERROR: denominator slot unparseable. Zero firehose. Return immediately.
        return { outcome: 'parse-error', error: parsedDen.error };
      }

      // Denominator-zero detection: learner entry of '0' as denominator is a
      // malformed fraction. Degrade to parse-error (zero firehose, no throw)
      // BEFORE calling canonicalizeFraction. This keeps the CanonicalError throw
      // in canonicalizeFraction strictly a programmer-error path.
      if (parsedDen.value === 0) {
        return {
          outcome: 'parse-error',
          error: { kind: 'malformed', rawInput: denSlot.rawInput },
        };
      }

      // Non-integer detection: a learner entering a decimal (e.g. '1,5' under UK locale)
      // in a fraction slot successfully parses via parseLocaleNumber (value = 1.5) but
      // canonicalizeFraction's !Number.isInteger guard would then THROW CanonicalError —
      // an unhandled throw violating the anti-shame invariant. Guard both slots here,
      // mirroring the den===0 pattern, so a decimal in a fraction slot is a silent
      // malformed parse-error (zero firehose rows), never a throw.
      if (!Number.isInteger(parsedNum.value)) {
        return {
          outcome: 'parse-error',
          error: { kind: 'malformed', rawInput: numSlot.rawInput },
        };
      }
      if (!Number.isInteger(parsedDen.value)) {
        return {
          outcome: 'parse-error',
          error: { kind: 'malformed', rawInput: denSlot.rawInput },
        };
      }

      // Fold both slots into one canonical fraction (the sole fraction-emission site).
      // Equivalent fractions match free: canonicalizeFraction(2,4) === '1/2' === step.expected '1/2'.
      const received = canonicalizeFraction(parsedNum.value, parsedDen.value);

      if (received !== step.expected) {
        // FAILED-STEP BRANCH: fraction fold mismatch (first-break).
        const failedStep: FailedStep = {
          stepIndex: stepIdx,
          skillNode: step.skillNode,
          expected: step.expected,
          received,
          // Carry diagnostic payload from the numerator slot if present.
          // NOTE: The denominator slot's diagnosticPayload is intentionally not
          // merged here — the numerator slot is the primary routing signal for
          // fraction steps (it is the first positional slot, and diagnostic
          // routing is per-step, not per-slot). A future multi-slot widget that
          // attaches routing signals to the denominator slot would need to extend
          // this branch. For MVP, the denominator diagnostic is silently dropped.
          ...(numSlot.diagnosticPayload !== undefined
            ? { diagnostic: numSlot.diagnosticPayload }
            : {}),
        };

        await appendFirehose('answer', {
          outcome: 'failed-step',
          skillNode: step.skillNode,
          stepIndex: stepIdx,
          expected: step.expected,
          received,
        });

        return { outcome: 'failed-step', failedStep };
      }

      // Fraction step matched — advance cursor by 2.
      outputIndex += 2;
    } else {
      // -----------------------------------------------------------------------
      // INTEGER / DECIMAL BRANCH (numberClass !== 'fraction')
      // UNCHANGED from stage-03: parse one slot, canonicalize, compare.
      // -----------------------------------------------------------------------

      const output = outputs[outputIndex];

      // Step 1: Parse the raw input under the active locale profile.
      const parsed = parseLocaleNumber(output.rawInput, profile);

      if (!parsed.ok) {
        // PARSE-ERROR BRANCH: return immediately, emit ZERO firehose events.
        // A formatting slip is not a skill failure (anti-shame invariant).
        return { outcome: 'parse-error', error: parsed.error };
      }

      // Step 2: Canonicalize the parsed value (sole scalar number→string authority).
      const received = canonicalize(parsed.value);

      if (received !== step.expected) {
        // FAILED-STEP BRANCH: first-break mismatch.
        const failedStep: FailedStep = {
          stepIndex: stepIdx,
          skillNode: step.skillNode,
          expected: step.expected,
          received,
          // Carry diagnostic payload from the widget output if present.
          ...(output.diagnosticPayload !== undefined
            ? { diagnostic: output.diagnosticPayload }
            : {}),
        };

        // Emit one 'answer' firehose event (failed-step outcome).
        await appendFirehose('answer', {
          outcome: 'failed-step',
          skillNode: step.skillNode,
          stepIndex: stepIdx,
          expected: step.expected,
          received,
        });

        return { outcome: 'failed-step', failedStep };
      }

      // Step matched — advance cursor by 1.
      outputIndex += 1;
    }
  }

  // ALL STEPS MATCHED → correct.
  //
  // EMPTY-STEPS EDGE CASE (defined behaviour):
  //   A task with zero steps is a degenerate/programmer-shaped input — there is
  //   no skill to attribute and nothing the learner actually answered. We return
  //   { outcome: 'correct' } (vacuously, all-zero steps matched) but emit NO
  //   firehose event: a firehose 'answer' row carries a meaningful skillNode for
  //   scoring/routing, and an empty-steps row would have skillNode '' — a junk
  //   routing target. Silence here keeps the event stream meaningful and avoids
  //   a synthetic '' skillNode ever entering scoring (consistent with the
  //   anti-shame / clean-signal invariant). Real tasks always carry ≥1 step.
  if (steps.length === 0) {
    return { outcome: 'correct' };
  }

  // Emit one 'answer' firehose event (correct outcome).
  // skillNode from the last step (the task's primary skill node).
  const primarySkillNode = steps[steps.length - 1].skillNode;

  await appendFirehose('answer', {
    outcome: 'correct',
    skillNode: primarySkillNode,
    stepsCount: steps.length,
  });

  return { outcome: 'correct' };
}
