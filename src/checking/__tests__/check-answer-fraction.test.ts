/**
 * check-answer-fraction.test.ts — Phase 2 tests for the fraction fold branch.
 *
 * Tests cover (per the Phase 2 plan):
 *
 *   (a) Equivalent fraction match: ['2','4'] vs expected '1/2' → correct
 *   (b) Reduced match: ['1','2'] vs expected '1/2' → correct
 *   (c) Mismatch: ['1','3'] vs expected '1/2' → failed-step with received '1/3'
 *   (d) Whole-fraction: ['4','1'] folds to '4' and matches an integer-shaped expected
 *   (e) Denominator-zero: ['1','0'] → parse-error, no throw, zero firehose rows
 *   (f) Expected-width guard: wrong total output count → throws programmer error
 *   (g) Mixed task (decimal step + fraction step): correct cursor advancement
 *   (h) Parse-error in numerator slot → parse-error masking later mismatch
 *   (i) Firehose: correct emits 1 row, failed-step emits 1 row, parse-error emits 0
 *   (j) Regression: all-integer task produces byte-identical outcomes (unchanged path)
 *
 * Uses the stage-01 useTestDb() harness for in-memory SQLite isolation.
 */

import { checkAnswer } from '../check-answer';
import { readAllFirehose } from '@/repositories';
import { resolveLocaleProfile } from '@/parsing';
import { canonicalize, canonicalizeFraction, SCALAR_DECIMAL_POLICY, SCALAR_INTEGER_POLICY } from '@/core/canonical';
import type { NormalizationPolicy } from '@/core/canonical';
import type { Step } from '@/core/types';
import type { WidgetOutput } from '@/widgets';
import { useTestDb } from '../../../jest.setup';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const UK = resolveLocaleProfile('uk');

/** Fraction normalization policy (numberClass: 'fraction'). */
const FRACTION_POLICY: NormalizationPolicy = Object.freeze({
  decimalForm: 'standard' as const,
  ordering: 'n/a' as const,
  lowestTerms: true,
  numberClass: 'fraction' as const,
});

/** Build a minimal integer Step (numberClass 'integer', one output slot). */
function makeIntegerStep(
  expected: string,
  opts: Partial<Pick<Step, 'skillNode' | 'inputMode'>> = {}
): Step {
  return {
    prompt: { key: 'test.step' },
    inputMode: opts.inputMode ?? 'number',
    expected,
    skillNode: opts.skillNode ?? 'test-node',
    elicitFromMastery: 0,
    normalizationPolicy: SCALAR_INTEGER_POLICY,
  };
}

/** Build a minimal decimal Step (numberClass 'decimal', one output slot). */
function makeDecimalStep(
  expected: string,
  opts: Partial<Pick<Step, 'skillNode' | 'inputMode'>> = {}
): Step {
  return {
    prompt: { key: 'test.step' },
    inputMode: opts.inputMode ?? 'number',
    expected,
    skillNode: opts.skillNode ?? 'test-node',
    elicitFromMastery: 0,
    normalizationPolicy: SCALAR_DECIMAL_POLICY,
  };
}

/** Build a fraction Step (numberClass 'fraction', consumes TWO output slots). */
function makeFractionStep(
  expected: string,
  opts: Partial<Pick<Step, 'skillNode' | 'inputMode'>> = {}
): Step {
  return {
    prompt: { key: 'test.fraction-step' },
    inputMode: opts.inputMode ?? 'multi-slot',
    expected,
    skillNode: opts.skillNode ?? 'fraction-node',
    elicitFromMastery: 0,
    normalizationPolicy: FRACTION_POLICY,
  };
}

/** Build a minimal WidgetOutput for testing. */
function makeOutput(rawInput: string, opts: Partial<WidgetOutput> = {}): WidgetOutput {
  return {
    rawInput,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// DB setup (in-memory SQLite for firehose assertions)
// ---------------------------------------------------------------------------

useTestDb();

// ---------------------------------------------------------------------------
// (a) Equivalent fraction match — canonicalizeFraction reduces, so 2/4 ≡ 1/2
// ---------------------------------------------------------------------------

describe('checkAnswer — fraction fold branch: equivalent fraction match', () => {
  it("['2','4'] vs expected '1/2' → correct (equivalence accepted free)", async () => {
    // 2/4 reduces to 1/2; canonicalizeFraction(2,4) === '1/2' === expected '1/2'
    const steps = [makeFractionStep('1/2', { skillNode: 'fraction-simplification' })];
    const outputs = [makeOutput('2'), makeOutput('4')]; // numerator slot, denominator slot

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it("['1','2'] vs expected '1/2' → correct (already reduced)", async () => {
    const steps = [makeFractionStep('1/2', { skillNode: 'fraction-simplification' })];
    const outputs = [makeOutput('1'), makeOutput('2')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it("['6','8'] vs expected '3/4' → correct (6/8 reduces to 3/4)", async () => {
    const steps = [makeFractionStep('3/4')];
    const outputs = [makeOutput('6'), makeOutput('8')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it("emits exactly ONE 'answer' firehose row on correct fraction match", async () => {
    const steps = [makeFractionStep('1/2', { skillNode: 'frac-node' })];
    const outputs = [makeOutput('2'), makeOutput('4')];

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('answer');
    const payload = JSON.parse(rows[0].payload) as Record<string, unknown>;
    expect(payload.outcome).toBe('correct');
    expect(payload.skillNode).toBe('frac-node');
  });
});

// ---------------------------------------------------------------------------
// (b/c) Fraction mismatch → failed-step with canonical received
// ---------------------------------------------------------------------------

describe('checkAnswer — fraction fold branch: mismatch → failed-step', () => {
  it("['1','3'] vs expected '1/2' → failed-step with received '1/3'", async () => {
    const steps = [makeFractionStep('1/2', { skillNode: 'fraction-node' })];
    const outputs = [makeOutput('1'), makeOutput('3')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.stepIndex).toBe(0);
    expect(result.failedStep.skillNode).toBe('fraction-node');
    expect(result.failedStep.expected).toBe('1/2');
    expect(result.failedStep.received).toBe('1/3');
  });

  it("failed-step received is the canonical fraction string (canonicalizeFraction output)", async () => {
    // Learner enters '2/6' (non-reduced); received should be '1/3' (reduced), not '2/6'
    const steps = [makeFractionStep('1/2', { skillNode: 'fraction-node' })];
    const outputs = [makeOutput('2'), makeOutput('6')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    // canonicalizeFraction(2,6) === '1/3', not '2/6'
    expect(result.failedStep.received).toBe('1/3');
  });

  it("emits exactly ONE 'answer' firehose row on fraction failed-step", async () => {
    const steps = [makeFractionStep('1/2', { skillNode: 'frac-node' })];
    const outputs = [makeOutput('1'), makeOutput('3')]; // mismatch: 1/3 ≠ 1/2

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('answer');
    const payload = JSON.parse(rows[0].payload) as Record<string, unknown>;
    expect(payload.outcome).toBe('failed-step');
    expect(payload.skillNode).toBe('frac-node');
    expect(payload.received).toBe('1/3');
    expect(payload.expected).toBe('1/2');
  });
});

// ---------------------------------------------------------------------------
// (d) Whole-fraction: numerator/denominator whose reduced form is an integer
// ---------------------------------------------------------------------------

describe('checkAnswer — fraction fold branch: integer collapse', () => {
  it("['4','1'] folds to '4' and matches integer-shaped expected '4'", async () => {
    // canonicalizeFraction(4, 1) === '4' (q===1 collapses to integer via canonicalize)
    const steps = [makeFractionStep('4', { skillNode: 'fraction-node' })];
    const outputs = [makeOutput('4'), makeOutput('1')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it("['6','2'] folds to '3' (reduces to 3/1 → integer)", async () => {
    // canonicalizeFraction(6, 2) === '3'
    const steps = [makeFractionStep('3', { skillNode: 'fraction-node' })];
    const outputs = [makeOutput('6'), makeOutput('2')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });
});

// ---------------------------------------------------------------------------
// (e) Denominator-zero → parse-error, no throw, zero firehose rows
// ---------------------------------------------------------------------------

describe('checkAnswer — fraction fold branch: denominator zero → parse-error (anti-shame)', () => {
  it("['1','0'] → parse-error outcome (not a throw)", async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('0')];

    // Must not throw — the test itself would fail if it threw
    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
  });

  it("denominator zero: error.kind is 'malformed' and rawInput is '0'", async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('0')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    if (result.outcome !== 'parse-error') return;
    expect(result.error.kind).toBe('malformed');
    expect(result.error.rawInput).toBe('0');
  });

  it("denominator zero: ZERO firehose rows (total silence — anti-shame invariant)", async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('0')];

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it("denominator zero with negative numerator: still parse-error, not throw", async () => {
    const steps = [makeFractionStep('-1/2')];
    const outputs = [makeOutput('-1'), makeOutput('0')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
  });
});

// ---------------------------------------------------------------------------
// (f) Expected-width guard: wrong total output count throws programmer error
// ---------------------------------------------------------------------------

describe('checkAnswer — expected-width guard', () => {
  it('fraction step expects 2 outputs; providing 1 throws programmer error', async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1')]; // only 1, but fraction step needs 2

    await expect(checkAnswer(steps, outputs, UK)).rejects.toThrow(
      /outputs\.length.*!==.*expectedWidth/
    );
  });

  it('fraction step expects 2 outputs; providing 3 throws programmer error', async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('2'), makeOutput('3')]; // too many

    await expect(checkAnswer(steps, outputs, UK)).rejects.toThrow(
      /outputs\.length.*!==.*expectedWidth/
    );
  });

  it('mixed (integer + fraction) expects 3 outputs; providing 2 throws', async () => {
    // integer (width=1) + fraction (width=2) = expectedWidth 3
    const steps = [
      makeIntegerStep('5', { skillNode: 'node-a' }),
      makeFractionStep('1/2', { skillNode: 'node-b' }),
    ];
    const outputs = [makeOutput('5'), makeOutput('1')]; // only 2, need 3

    await expect(checkAnswer(steps, outputs, UK)).rejects.toThrow(
      /outputs\.length.*!==.*expectedWidth/
    );
  });

  it('two fraction steps: expectedWidth = 4; providing 3 throws', async () => {
    const steps = [makeFractionStep('1/2'), makeFractionStep('3/4')];
    const outputs = [makeOutput('1'), makeOutput('2'), makeOutput('3')]; // 3, need 4

    await expect(checkAnswer(steps, outputs, UK)).rejects.toThrow(
      /outputs\.length.*!==.*expectedWidth/
    );
  });

  it('all-integer steps: expectedWidth equals steps.length (backward-compatible)', async () => {
    // 3 integer steps → expectedWidth 3 → 3 outputs is still valid
    const steps = [makeIntegerStep('1'), makeIntegerStep('2'), makeIntegerStep('3')];
    const outputs = [makeOutput('1'), makeOutput('2'), makeOutput('3')];

    await expect(checkAnswer(steps, outputs, UK)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// (g) Mixed task: decimal step + fraction step → correct cursor advancement
// ---------------------------------------------------------------------------

describe('checkAnswer — mixed task (decimal + fraction steps)', () => {
  it('decimal step (slot 0) + fraction step (slots 1+2): all correct → correct', async () => {
    // expectedWidth = 1 (decimal) + 2 (fraction) = 3
    const steps = [
      makeDecimalStep('3.5', { skillNode: 'node-decimal' }),
      makeFractionStep('1/2', { skillNode: 'node-fraction' }),
    ];
    const outputs = [
      makeOutput('3,5'),  // uk locale decimal → 3.5
      makeOutput('1'),    // fraction numerator
      makeOutput('2'),    // fraction denominator
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('decimal step correct, fraction step mismatch → failed-step at stepIndex 1', async () => {
    const steps = [
      makeDecimalStep('3.5', { skillNode: 'node-decimal' }),
      makeFractionStep('1/2', { skillNode: 'node-fraction' }),
    ];
    const outputs = [
      makeOutput('3,5'),  // decimal step: correct
      makeOutput('1'),    // fraction numerator
      makeOutput('3'),    // fraction denominator → 1/3 ≠ 1/2 → mismatch
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.stepIndex).toBe(1);
    expect(result.failedStep.skillNode).toBe('node-fraction');
    expect(result.failedStep.received).toBe('1/3');
    expect(result.failedStep.expected).toBe('1/2');
  });

  it('decimal step mismatch stops before fraction step (first-break)', async () => {
    const steps = [
      makeDecimalStep('3.5', { skillNode: 'node-decimal' }),
      makeFractionStep('1/2', { skillNode: 'node-fraction' }),
    ];
    const outputs = [
      makeOutput('5'),    // decimal step: WRONG (5 ≠ 3.5)
      makeOutput('1'),    // fraction slots: never evaluated
      makeOutput('2'),
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.stepIndex).toBe(0);
    expect(result.failedStep.skillNode).toBe('node-decimal');
    expect(result.failedStep.received).toBe('5');
  });

  it('fraction step (slots 0+1) + integer step (slot 2): correct order', async () => {
    // fraction (width=2) + integer (width=1) = expectedWidth 3
    const steps = [
      makeFractionStep('3/4', { skillNode: 'frac-first' }),
      makeIntegerStep('7', { skillNode: 'int-second' }),
    ];
    const outputs = [
      makeOutput('3'),  // fraction numerator
      makeOutput('4'),  // fraction denominator
      makeOutput('7'),  // integer step
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });
});

// ---------------------------------------------------------------------------
// (h) Parse-error in numerator slot → parse-error masking later mismatch
// ---------------------------------------------------------------------------

describe('checkAnswer — fraction fold branch: parse-error precedes mismatch', () => {
  it('numerator slot parse-error → parse-error outcome (not failed-step)', async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('abc'), makeOutput('2')]; // 'abc' is unparseable

    const result = await checkAnswer(steps, outputs, UK);

    // CRITICAL: parse-error, not failed-step (even though the fraction would mismatch)
    expect(result.outcome).toBe('parse-error');
  });

  it('numerator parse-error: ZERO firehose rows', async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('abc'), makeOutput('2')];

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it('denominator slot parse-error (empty) → parse-error outcome', async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('')]; // denominator is empty

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    if (result.outcome !== 'parse-error') return;
    expect(result.error.kind).toBe('empty');
  });

  it('denominator parse-error: ZERO firehose rows', async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('')]; // denominator empty

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it('fraction parse-error at step 0 stops before a later step (first-break)', async () => {
    // fraction parse-error at step 0, integer at step 1 never evaluated
    const steps = [
      makeFractionStep('1/2', { skillNode: 'frac' }),
      makeIntegerStep('5', { skillNode: 'int-never-reached' }),
    ];
    const outputs = [makeOutput('abc'), makeOutput('2'), makeOutput('5')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (i) Firehose: correct/failed-step emit 1 row each; parse-error emits 0
// ---------------------------------------------------------------------------

describe('checkAnswer — fraction fold: firehose emission policy', () => {
  it('correct fraction emits exactly 1 answer row', async () => {
    const steps = [makeFractionStep('1/2', { skillNode: 'skill-a' })];
    const outputs = [makeOutput('2'), makeOutput('4')]; // 2/4 → 1/2 correct

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0].payload) as Record<string, unknown>;
    expect(payload.outcome).toBe('correct');
  });

  it('failed-step fraction emits exactly 1 answer row', async () => {
    const steps = [makeFractionStep('1/2', { skillNode: 'skill-b' })];
    const outputs = [makeOutput('1'), makeOutput('3')]; // 1/3 ≠ 1/2

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0].payload) as Record<string, unknown>;
    expect(payload.outcome).toBe('failed-step');
  });

  it('parse-error fraction emits ZERO rows (total silence — load-bearing anti-shame)', async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('0')]; // den=0 → parse-error

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it('sequence: correct(1) + parse-error(0) + failed-step(1) = 2 total rows', async () => {
    // correct fraction
    await checkAnswer(
      [makeFractionStep('1/2')],
      [makeOutput('1'), makeOutput('2')],
      UK
    );

    // parse-error (denominator zero)
    await checkAnswer(
      [makeFractionStep('1/2')],
      [makeOutput('1'), makeOutput('0')],
      UK
    );

    // failed-step fraction
    await checkAnswer(
      [makeFractionStep('1/2')],
      [makeOutput('1'), makeOutput('3')],
      UK
    );

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(2); // 1 correct + 0 parse-error + 1 failed-step
    const payloads = rows.map((r) => JSON.parse(r.payload) as Record<string, unknown>);
    expect(payloads[0].outcome).toBe('correct');
    expect(payloads[1].outcome).toBe('failed-step');
  });
});

// ---------------------------------------------------------------------------
// (k) Non-integer fraction slot → parse-error, no throw, zero firehose rows
//
// These tests cover the Must-fix from the phase-2 review: a learner entering
// a decimal in a fraction slot (e.g. '1,5' under UK locale parses as 1.5 via
// parseLocaleNumber) must produce a silent parse-error — NEVER an unhandled
// CanonicalError throw from canonicalizeFraction's !Number.isInteger guard.
// ---------------------------------------------------------------------------

describe('checkAnswer — fraction fold branch: non-integer slot → parse-error (anti-shame)', () => {
  it("numerator slot decimal ['1,5','2'] → parse-error outcome, no throw", async () => {
    // UK locale: '1,5' parses as 1.5 (non-integer); canonicalizeFraction would throw.
    // Must return parse-error silently, never throw.
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1,5'), makeOutput('2')];

    // Must not throw — the test itself would fail if it threw
    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
  });

  it("numerator slot decimal: error.kind is 'malformed' with rawInput '1,5'", async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1,5'), makeOutput('2')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    if (result.outcome !== 'parse-error') return;
    expect(result.error.kind).toBe('malformed');
    expect(result.error.rawInput).toBe('1,5');
  });

  it("numerator slot decimal: ZERO firehose rows (total silence — anti-shame invariant)", async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1,5'), makeOutput('2')];

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it("denominator slot decimal ['1','2,5'] → parse-error outcome, no throw", async () => {
    // UK locale: '2,5' parses as 2.5 (non-integer); guard catches before canonicalizeFraction.
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('2,5')];

    // Must not throw
    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
  });

  it("denominator slot decimal: error.kind is 'malformed' with rawInput '2,5'", async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('2,5')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    if (result.outcome !== 'parse-error') return;
    expect(result.error.kind).toBe('malformed');
    expect(result.error.rawInput).toBe('2,5');
  });

  it("denominator slot decimal: ZERO firehose rows (total silence — anti-shame invariant)", async () => {
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('1'), makeOutput('2,5')];

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it("both slots decimal: numerator error wins (first-break)", async () => {
    // Both are decimals; numerator is checked first, so its error is returned
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('0,5'), makeOutput('1,5')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    if (result.outcome !== 'parse-error') return;
    expect(result.error.rawInput).toBe('0,5'); // numerator checked first
  });

  it("non-integer numerator slot (EN decimal '0.5') → parse-error, no throw", async () => {
    // Even with the EN profile where '0.5' parses as 0.5 (non-integer)
    const EN = resolveLocaleProfile('en');
    const steps = [makeFractionStep('1/2')];
    const outputs = [makeOutput('0.5'), makeOutput('2')];

    const result = await checkAnswer(steps, outputs, EN);

    expect(result.outcome).toBe('parse-error');
  });
});

// ---------------------------------------------------------------------------
// (j) Regression: all-integer task produces byte-identical outcomes (unchanged path)
// ---------------------------------------------------------------------------

describe('checkAnswer — regression: integer/decimal path unchanged', () => {
  it('all-integer correct → correct (same as before Phase 2)', async () => {
    const steps = [makeIntegerStep('3'), makeIntegerStep('7')];
    const outputs = [makeOutput('3'), makeOutput('7')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('all-integer failed-step → failed-step with correct stepIndex (same as before)', async () => {
    const steps = [makeIntegerStep('3', { skillNode: 'int-a' }), makeIntegerStep('7', { skillNode: 'int-b' })];
    const outputs = [makeOutput('3'), makeOutput('9')]; // step 1 wrong

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.stepIndex).toBe(1);
    expect(result.failedStep.skillNode).toBe('int-b');
  });

  it('all-integer parse-error → parse-error, zero firehose (same as before)', async () => {
    const steps = [makeIntegerStep('5')];
    const outputs = [makeOutput('')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it('all-integer: correct emits 1 row, parse-error emits 0 (emission counts unchanged)', async () => {
    await checkAnswer([makeIntegerStep('1')], [makeOutput('1')], UK);
    await checkAnswer([makeIntegerStep('1')], [makeOutput('')], UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1); // only the correct call emitted
  });

  it('canonicalizeFraction used in the fraction branch is the SAME function as fraction generator uses', async () => {
    // Verify that the expected value produced by canonicalizeFraction directly
    // matches what the checker computes when given the same numerator/denominator.
    const expected = canonicalizeFraction(3, 9); // '1/3'
    const steps = [makeFractionStep(expected, { skillNode: 'fraction-simplification' })];
    const outputs = [makeOutput('3'), makeOutput('9')]; // 3/9 reduces to 1/3

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('integer step expected from canonicalize round-trips correctly', async () => {
    const expected = canonicalize(42);
    const steps = [makeIntegerStep(expected, { skillNode: 'multiplication' })];
    const outputs = [makeOutput('42')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });
});
