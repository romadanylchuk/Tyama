/**
 * check-answer.test.ts — Comprehensive tests for the generic step-level checking engine.
 *
 * Tests cover (per the Phase 3 plan):
 *   (a) All-steps-match → 'correct', exactly one 'answer' firehose row
 *   (b) First-break on step k → 'failed-step' with stepIndex===k, skillNode, canonical received,
 *       one 'answer' firehose row; later steps NOT evaluated
 *   (c) Parse failure on any step → 'parse-error', ZERO firehose rows (total silence)
 *   (d) Parse-error precedes mismatch within the same step
 *   (e) Multi-slot: N steps over N positionally-aligned outputs, first-break stops
 *   (f) diagnostic from choice/tokens output carried into failedStep.diagnostic
 *   (g) Dormant policy: a step with a non-default normalizationPolicy still compared
 *       via canonicalize(value) === step.expected
 *   (h) End-to-end: fruitEquations.generate(…).steps[] checked with correct
 *       locale-formatted rawInputs (uk '3,5') → 'correct'
 *   (i) Programmer-error guard: outputs.length !== steps.length throws
 *
 * FIREHOSE ASSERTION (load-bearing anti-shame):
 *   parse-error → ZERO firehose rows (total silence, not even 'error' type)
 *   correct     → exactly ONE 'answer' row
 *   failed-step → exactly ONE 'answer' row
 *
 * Uses the stage-01 useTestDb() harness for in-memory SQLite isolation.
 */

import { checkAnswer } from '../check-answer';
import { readAllFirehose } from '@/repositories';
import { resolveLocaleProfile } from '@/parsing';
import { canonicalize, SCALAR_DECIMAL_POLICY } from '@/core/canonical';
import type { Step } from '@/core/types';
import type { WidgetOutput } from '@/widgets';
import { fruitEquations } from '@/core/generators/fruit-equations';
import { createSeededRng } from '@/core/rng/seeded-rng';
import { useTestDb } from '../../../jest.setup';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const UK = resolveLocaleProfile('uk');
const EN = resolveLocaleProfile('en');

/** Build a minimal Step for testing. */
function makeStep(
  expected: string,
  opts: Partial<Pick<Step, 'skillNode' | 'inputMode' | 'normalizationPolicy'>> = {}
): Step {
  return {
    prompt: { key: 'test.step' },
    inputMode: opts.inputMode ?? 'number',
    expected,
    skillNode: opts.skillNode ?? 'test-node',
    elicitFromMastery: 0,
    normalizationPolicy: opts.normalizationPolicy ?? SCALAR_DECIMAL_POLICY,
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
// (a) Correct outcome + exactly one 'answer' firehose row
// ---------------------------------------------------------------------------

describe('checkAnswer — correct outcome', () => {
  it('returns correct when single step matches (uk locale)', async () => {
    const steps = [makeStep('3')];
    const outputs = [makeOutput('3')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('emits exactly one answer firehose row on correct', async () => {
    const steps = [makeStep('5')];
    const outputs = [makeOutput('5')];

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('answer');
    const payload = JSON.parse(rows[0].payload) as Record<string, unknown>;
    expect(payload.outcome).toBe('correct');
  });

  it('returns correct when multiple steps all match', async () => {
    const steps = [makeStep('3'), makeStep('7'), makeStep('5')];
    const outputs = [makeOutput('3'), makeOutput('7'), makeOutput('5')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('emits exactly one answer firehose row even with multiple steps (correct)', async () => {
    const steps = [makeStep('1'), makeStep('2')];
    const outputs = [makeOutput('1'), makeOutput('2')];

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
  });

  it('handles locale-formatted correct input (uk decimal comma)', async () => {
    const steps = [makeStep('3.5')]; // canonical form uses '.'
    const outputs = [makeOutput('3,5')]; // uk locale uses ','

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('handles en locale decimal point', async () => {
    const steps = [makeStep('3.5')];
    const outputs = [makeOutput('3.5')];

    const result = await checkAnswer(steps, outputs, EN);

    expect(result.outcome).toBe('correct');
  });
});

// ---------------------------------------------------------------------------
// (b) First-break: failed-step outcome + firehose row
// ---------------------------------------------------------------------------

describe('checkAnswer — failed-step outcome', () => {
  it('returns failed-step at step 0 when first step mismatches', async () => {
    const steps = [makeStep('5', { skillNode: 'node-A' })];
    const outputs = [makeOutput('3')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.stepIndex).toBe(0);
    expect(result.failedStep.skillNode).toBe('node-A');
    expect(result.failedStep.expected).toBe('5');
    expect(result.failedStep.received).toBe('3');
  });

  it('stops at first mismatch (does NOT evaluate later steps)', async () => {
    // Steps: [correct, WRONG, correct-but-never-evaluated]
    const steps = [
      makeStep('1', { skillNode: 'first-node' }),
      makeStep('99', { skillNode: 'fail-node' }),
      makeStep('3', { skillNode: 'third-node' }),
    ];
    const outputs = [
      makeOutput('1'),
      makeOutput('0'),   // WRONG — should produce failed-step at index 1
      makeOutput('3'),   // step 2 not evaluated
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    // First-break at step 1, not step 2.
    expect(result.failedStep.stepIndex).toBe(1);
    expect(result.failedStep.skillNode).toBe('fail-node');
  });

  it('returns failed-step at step k (not 0)', async () => {
    const steps = [
      makeStep('1', { skillNode: 'first-node' }),
      makeStep('2', { skillNode: 'second-node' }),
      makeStep('100', { skillNode: 'third-node' }),  // mismatch here
    ];
    const outputs = [
      makeOutput('1'),
      makeOutput('2'),
      makeOutput('9'),  // wrong for step 2
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.stepIndex).toBe(2);
    expect(result.failedStep.skillNode).toBe('third-node');
  });

  it('failed-step.received is the CANONICAL string (not raw locale glyph)', async () => {
    // Learner enters '3,5' (uk locale); canonical form is '3.5'
    // Expected is '7', so it mismatches.
    const steps = [makeStep('7')];
    const outputs = [makeOutput('3,5')]; // parses to 3.5

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    // received must be canonical '3.5', not raw '3,5'
    expect(result.failedStep.received).toBe('3.5');
  });

  it('emits exactly one answer firehose row on failed-step', async () => {
    const steps = [makeStep('5', { skillNode: 'node-X' })];
    const outputs = [makeOutput('3')];

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('answer');
    const payload = JSON.parse(rows[0].payload) as Record<string, unknown>;
    expect(payload.outcome).toBe('failed-step');
    expect(payload.skillNode).toBe('node-X');
    expect(payload.stepIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (c) Parse-error → ZERO firehose rows (total silence)
// ---------------------------------------------------------------------------

describe('checkAnswer — parse-error total silence', () => {
  it('returns parse-error for empty input', async () => {
    const steps = [makeStep('5')];
    const outputs = [makeOutput('')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
  });

  it('returns parse-error for non-numeric input', async () => {
    const steps = [makeStep('5')];
    const outputs = [makeOutput('abc')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
  });

  it('ZERO firehose rows on parse-error (total silence — load-bearing anti-shame assertion)', async () => {
    const steps = [makeStep('5')];
    const outputs = [makeOutput('')]; // empty → parse-error

    await checkAnswer(steps, outputs, UK);

    const rows = await readAllFirehose();
    // CRITICAL ASSERTION: parse-error produces ZERO rows — not even 'error' type.
    expect(rows).toHaveLength(0);
  });

  it('ZERO firehose rows for any parse-error kind', async () => {
    const cases = [
      '',           // 'empty'
      'abc',        // 'unrecognized-glyph'
      '1..5',       // 'multiple-decimals'
    ];

    for (const rawInput of cases) {
      const steps = [makeStep('5')];
      const outputs = [makeOutput(rawInput)];

      await checkAnswer(steps, outputs, UK);
    }

    const rows = await readAllFirehose();
    // All three parse-errors → still zero rows.
    expect(rows).toHaveLength(0);
  });

  it('returns parse-error with the structured error object (rawInput preserved)', async () => {
    const steps = [makeStep('5')];
    const outputs = [makeOutput('xyz')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    if (result.outcome !== 'parse-error') return;
    expect(result.error.rawInput).toBe('xyz');
    expect(result.error.kind).toBe('unrecognized-glyph');
  });
});

// ---------------------------------------------------------------------------
// (d) Parse-error precedes mismatch within the same step
// ---------------------------------------------------------------------------

describe('checkAnswer — parse-error precedes mismatch', () => {
  it('parse-error at step i returned even if the value would mismatch step.expected', async () => {
    // 'abc' is both unparseable AND would not equal '5' if somehow parsed.
    // The result must be parse-error, NOT failed-step.
    const steps = [makeStep('5')];
    const outputs = [makeOutput('abc')];

    const result = await checkAnswer(steps, outputs, UK);

    // CRITICAL: parse-error, not failed-step
    expect(result.outcome).toBe('parse-error');
    // And zero firehose rows (not one).
    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it('parse-error at step i stops evaluation even when step i+1 would mismatch', async () => {
    // Step 0: parse-error ('abc')
    // Step 1: would mismatch (rawInput '9' vs expected '42')
    const steps = [makeStep('5'), makeStep('42', { skillNode: 'never-reached' })];
    const outputs = [makeOutput('abc'), makeOutput('9')];

    const result = await checkAnswer(steps, outputs, UK);

    // parse-error stops at step 0 — step 1 is never evaluated
    expect(result.outcome).toBe('parse-error');
    // No firehose rows
    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });

  it('parse-error at a middle step: steps before it matched, steps after not evaluated', async () => {
    const steps = [
      makeStep('1'),
      makeStep('2'),  // step 1 will parse-error
      makeStep('3'),
    ];
    const outputs = [
      makeOutput('1'),   // step 0 matches
      makeOutput(''),    // step 1: empty → parse-error
      makeOutput('3'),   // step 2: never evaluated
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('parse-error');
    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (e) Multi-slot: N steps over N positionally-aligned outputs
// ---------------------------------------------------------------------------

describe('checkAnswer — multi-slot positional checking', () => {
  it('checks N slots in order; all correct → correct', async () => {
    const steps = [
      makeStep('1', { skillNode: 'node-A' }),
      makeStep('2', { skillNode: 'node-B' }),
      makeStep('3', { skillNode: 'node-C' }),
    ];
    const outputs = [makeOutput('1'), makeOutput('2'), makeOutput('3')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('first-break stops at first divergent slot (multi-slot)', async () => {
    const steps = [
      makeStep('1', { skillNode: 'slot-0' }),
      makeStep('2', { skillNode: 'slot-1' }),  // this will mismatch
      makeStep('3', { skillNode: 'slot-2' }),
    ];
    const outputs = [
      makeOutput('1'),   // slot 0: correct
      makeOutput('9'),   // slot 1: wrong
      makeOutput('3'),   // slot 2: never evaluated
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.stepIndex).toBe(1);
    expect(result.failedStep.skillNode).toBe('slot-1');
  });
});

// ---------------------------------------------------------------------------
// (f) diagnostic payload carried from WidgetOutput into failedStep.diagnostic
// ---------------------------------------------------------------------------

describe('checkAnswer — diagnostic payload forwarding', () => {
  it('carries choice diagnosticPayload into failedStep.diagnostic', async () => {
    // Use a numeric mismatch (3 vs expected 5) with a choice diagnosticPayload.
    const steps = [makeStep('5', { skillNode: 'node-D' })];
    const outputs = [
      makeOutput('3', {
        diagnosticPayload: {
          kind: 'choice' as const,
          chosenId: 'option-B',
          errorType: 'magnitude-confusion',
        },
      }),
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.diagnostic).toBeDefined();
    expect(result.failedStep.diagnostic?.kind).toBe('choice');
    if (result.failedStep.diagnostic?.kind === 'choice') {
      expect(result.failedStep.diagnostic.chosenId).toBe('option-B');
      expect(result.failedStep.diagnostic.errorType).toBe('magnitude-confusion');
    }
  });

  it('carries tokens diagnosticPayload into failedStep.diagnostic', async () => {
    const steps = [makeStep('5', { skillNode: 'tokens-node', inputMode: 'tokens' })];
    const outputs = [
      makeOutput('3', {
        diagnosticPayload: {
          kind: 'tokens' as const,
          divergedAt: 2,
        },
      }),
    ];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.diagnostic).toBeDefined();
    expect(result.failedStep.diagnostic?.kind).toBe('tokens');
    if (result.failedStep.diagnostic?.kind === 'tokens') {
      expect(result.failedStep.diagnostic.divergedAt).toBe(2);
    }
  });

  it('failedStep.diagnostic is absent when output has no diagnosticPayload', async () => {
    const steps = [makeStep('5', { skillNode: 'number-node', inputMode: 'number' })];
    const outputs = [makeOutput('3')]; // no diagnosticPayload

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.diagnostic).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (g) Active policy: normalizationPolicy.numberClass discriminates fraction vs scalar path
// ---------------------------------------------------------------------------

describe('checkAnswer — active normalizationPolicy discrimination', () => {
  it('integer/decimal step uses canonicalize() path (one output, canonical string compare)', async () => {
    // A step with numberClass 'integer' uses the scalar path regardless of other fields.
    const integerPolicy = {
      decimalForm: 'standard' as const,
      ordering: 'n/a' as const,
      lowestTerms: false,
      numberClass: 'integer' as const,
    };

    const steps = [makeStep('2', { normalizationPolicy: integerPolicy })];
    const outputs = [makeOutput('2')]; // one output for integer step

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('integer step mismatch detected by canonicalize equality (not fraction branch)', async () => {
    const integerPolicy = {
      decimalForm: 'standard' as const,
      ordering: 'n/a' as const,
      lowestTerms: false,
      numberClass: 'integer' as const,
    };

    const steps = [makeStep('3', { normalizationPolicy: integerPolicy })];
    const outputs = [makeOutput('5')];

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.received).toBe('5');
    expect(result.failedStep.expected).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// (h) End-to-end: fruitEquations.generate(…) → checkAnswer with correct locale input
// ---------------------------------------------------------------------------

describe('checkAnswer — end-to-end with fruitEquations', () => {
  it('correct locale-formatted rawInputs → correct (1 unknown, abstract, uk locale)', async () => {
    // Use abstract representation so inputMode is 'number' (locale parsing path)
    const rng = createSeededRng(42);
    const difficulty = {
      representationLevel: 'abstract' as const,
      elicitFromMastery: 0,
      params: { unknowns: 1, range: 5, negatives: false },
    };

    const task = fruitEquations.generate(difficulty, rng);

    // Build WidgetOutputs with the correct locale-formatted values.
    // step.expected is canonical (e.g. '3'); for uk locale, we can just use it as-is
    // since integer values don't need locale formatting.
    const outputs: WidgetOutput[] = task.steps.map((step) => ({
      rawInput: step.expected, // canonical integers round-trip through uk parser
    }));

    const result = await checkAnswer(task.steps, outputs, UK);

    expect(result.outcome).toBe('correct');

    // Verify exactly one firehose row
    const rows = await readAllFirehose();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('answer');
    const payload = JSON.parse(rows[0].payload) as Record<string, unknown>;
    expect(payload.outcome).toBe('correct');
  });

  it('uk locale decimal input through full pipeline → correct (decimal expected)', async () => {
    // Craft a task where expected is a decimal canonical value.
    // We'll use a known step with expected='3.5' and uk rawInput='3,5'.
    const steps = [makeStep(canonicalize(3.5), { skillNode: 'fruit-equations' })];
    const outputs = [makeOutput('3,5')]; // uk locale: comma is decimal separator

    const result = await checkAnswer(steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('end-to-end 2-unknown fruitEquations task → correct', async () => {
    const rng = createSeededRng(100);
    const difficulty = {
      representationLevel: 'abstract' as const,
      elicitFromMastery: 0,
      params: { unknowns: 2, range: 10, negatives: false },
    };

    const task = fruitEquations.generate(difficulty, rng);
    expect(task.steps).toHaveLength(2);

    // Provide correct canonical values as rawInput (integers parse under any locale)
    const outputs: WidgetOutput[] = task.steps.map((step) => ({
      rawInput: step.expected,
    }));

    const result = await checkAnswer(task.steps, outputs, UK);

    expect(result.outcome).toBe('correct');
  });

  it('wrong answer for one step → failed-step with skillNode=fruit-equations', async () => {
    const rng = createSeededRng(42);
    const difficulty = {
      representationLevel: 'abstract' as const,
      elicitFromMastery: 0,
      params: { unknowns: 1, range: 5, negatives: false },
    };

    const task = fruitEquations.generate(difficulty, rng);

    // Provide wrong answer
    const outputs: WidgetOutput[] = [{ rawInput: '999' }];

    const result = await checkAnswer(task.steps, outputs, UK);

    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.skillNode).toBe('fruit-equations');
    expect(result.failedStep.stepIndex).toBe(0);
    expect(result.failedStep.received).toBe('999');
  });
});

// ---------------------------------------------------------------------------
// (i) Programmer-error guard: outputs.length !== steps.length throws
// ---------------------------------------------------------------------------

describe('checkAnswer — programmer-error guard', () => {
  it('throws synchronously when outputs.length > steps.length', async () => {
    const steps = [makeStep('1')];
    const outputs = [makeOutput('1'), makeOutput('2')]; // too many

    await expect(checkAnswer(steps, outputs, UK)).rejects.toThrow(
      /outputs\.length.*!==.*expectedWidth/
    );
  });

  it('throws synchronously when outputs.length < steps.length', async () => {
    const steps = [makeStep('1'), makeStep('2')];
    const outputs = [makeOutput('1')]; // too few

    await expect(checkAnswer(steps, outputs, UK)).rejects.toThrow(
      /outputs\.length.*!==.*expectedWidth/
    );
  });

  it('does NOT throw when lengths match', async () => {
    const steps = [makeStep('1'), makeStep('2')];
    const outputs = [makeOutput('1'), makeOutput('2')];

    await expect(checkAnswer(steps, outputs, UK)).resolves.toBeDefined();
  });

  it('empty steps + empty outputs is valid (returns correct)', async () => {
    const result = await checkAnswer([], [], UK);
    expect(result.outcome).toBe('correct');
  });

  it('empty steps emits ZERO firehose rows (degenerate input — no junk skillNode)', async () => {
    // Defined behaviour: a zero-step task returns vacuously 'correct' but emits
    // NO 'answer' row. A firehose row needs a meaningful skillNode for
    // scoring/routing; an empty-steps row would carry skillNode '' — a junk
    // routing target. The engine stays silent rather than emit it.
    const result = await checkAnswer([], [], UK);
    expect(result.outcome).toBe('correct');

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Additional firehose isolation: interleaved correct/failed/parse-error
// ---------------------------------------------------------------------------

describe('checkAnswer — firehose isolation across multiple calls', () => {
  it('correct emits 1, failed-step emits 1, parse-error emits 0 in sequence', async () => {
    // Call 1: correct → 1 row
    await checkAnswer([makeStep('1')], [makeOutput('1')], UK);

    // Call 2: parse-error → 0 rows (total rows still 1)
    await checkAnswer([makeStep('5')], [makeOutput('')], UK);

    // Call 3: failed-step → 1 row (total rows now 2)
    await checkAnswer([makeStep('5')], [makeOutput('3')], UK);

    const rows = await readAllFirehose();
    expect(rows).toHaveLength(2); // 1 correct + 0 parse-error + 1 failed-step

    const types = rows.map((r) => r.type);
    expect(types).toEqual(['answer', 'answer']);

    const payloads = rows.map((r) => JSON.parse(r.payload) as Record<string, unknown>);
    expect(payloads[0].outcome).toBe('correct');
    expect(payloads[1].outcome).toBe('failed-step');
  });
});

// ---------------------------------------------------------------------------
// CheckResult type assertions (structural — verified at compile time)
// ---------------------------------------------------------------------------

describe('CheckResult type structure', () => {
  it('correct outcome has no extra fields (no skillNode, no error, no failedStep)', async () => {
    const result = await checkAnswer([makeStep('1')], [makeOutput('1')], UK);
    expect(result.outcome).toBe('correct');
    // Type narrowing: 'correct' union member has ONLY 'outcome'.
    const narrowed = result as { outcome: 'correct' };
    expect(Object.keys(narrowed)).toEqual(['outcome']);
  });

  it('parse-error has error field (no skillNode structurally)', async () => {
    const result = await checkAnswer([makeStep('5')], [makeOutput('')], UK);
    expect(result.outcome).toBe('parse-error');
    if (result.outcome !== 'parse-error') return;
    expect(result.error).toBeDefined();
    expect(result.error.kind).toBe('empty');
    // ParseError has NO skillNode field.
    expect(Object.keys(result.error)).not.toContain('skillNode');
  });

  it('failed-step has failedStep with skillNode', async () => {
    const result = await checkAnswer(
      [makeStep('5', { skillNode: 'skill-xyz' })],
      [makeOutput('3')],
      UK
    );
    expect(result.outcome).toBe('failed-step');
    if (result.outcome !== 'failed-step') return;
    expect(result.failedStep.skillNode).toBe('skill-xyz');
    expect(result.failedStep.stepIndex).toBe(0);
    expect(result.failedStep.expected).toBe('5');
    expect(result.failedStep.received).toBe('3');
  });
});
