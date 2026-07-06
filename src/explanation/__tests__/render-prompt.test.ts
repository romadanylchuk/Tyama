/**
 * render-prompt.test.ts — pure prompt assembly (Stage 06, Phase 3).
 *
 * Asserts: deterministic output for a fixed context; priorApproach toggles the
 * different-modality segment; the meta-instruction is always present; the
 * prompt contains the math and no personal-data fields; the correct answer
 * never appears as the lead (it appears after the problem/steps, and its own
 * label carries the "don't reveal it" instruction).
 */

import { SCALAR_INTEGER_POLICY } from '@/core/canonical';
import type { ExplanationRequestContext } from '../explanation-types';
import { PROMPT_TEMPLATES } from '../prompt-templates';
import { renderPrompt } from '../render-prompt';
import type { FailedStep } from '@/checking';
import type { Step } from '@/core/types';

const STEP_ONE: Step = {
  prompt: { key: 'fruit_eq.step.apples' },
  inputMode: 'number',
  expected: '3',
  skillNode: 'fruit-equations',
  elicitFromMastery: 1,
  normalizationPolicy: SCALAR_INTEGER_POLICY,
};

const STEP_TWO: Step = {
  prompt: { key: 'fruit_eq.step.total', vars: { apple: 3, banana: 5 } },
  inputMode: 'number',
  expected: '8',
  skillNode: 'fruit-equations',
  elicitFromMastery: 1,
  normalizationPolicy: SCALAR_INTEGER_POLICY,
};

const FAILED_STEP: FailedStep = {
  stepIndex: 1,
  skillNode: 'fruit-equations',
  expected: '8',
  received: '7',
};

function makeContext(
  overrides: Partial<ExplanationRequestContext> = {},
): ExplanationRequestContext {
  return {
    problem: {
      prompt: { key: 'fruit_eq.prompt', vars: { apple: 3, banana: 5 } },
      representation: 'pictorial',
    },
    studentAnswer: '7',
    correctAnswer: '8',
    method: { key: 'method.sum_parts' },
    steps: [STEP_ONE, STEP_TWO],
    failedStep: FAILED_STEP,
    skillNode: 'fruit-equations',
    contentLanguage: 'uk',
    explanationLanguage: 'uk',
    ...overrides,
  };
}

describe('renderPrompt()', () => {
  it('is deterministic — identical input produces an identical string', () => {
    const ctx = makeContext();
    const a = renderPrompt(ctx, PROMPT_TEMPLATES.uk);
    const b = renderPrompt(ctx, PROMPT_TEMPLATES.uk);
    expect(a).toBe(b);
  });

  it('always includes the meta-instruction text', () => {
    const output = renderPrompt(makeContext(), PROMPT_TEMPLATES.uk);
    expect(output).toContain(PROMPT_TEMPLATES.uk.instructionMeta);
  });

  it('includes the different-modality segment ONLY when priorApproach is present', () => {
    const withPrior = renderPrompt(
      makeContext({ priorApproach: { target: 'addition-within-20', reason: 'escalate' } }),
      PROMPT_TEMPLATES.uk,
    );
    const withoutPrior = renderPrompt(makeContext(), PROMPT_TEMPLATES.uk);

    expect(withPrior).toContain(PROMPT_TEMPLATES.uk.differentModality);
    expect(withoutPrior).not.toContain(PROMPT_TEMPLATES.uk.differentModality);
  });

  it('contains the math: student answer, correct answer, and each step expected value', () => {
    const output = renderPrompt(makeContext(), PROMPT_TEMPLATES.uk);
    expect(output).toContain('7'); // studentAnswer
    expect(output).toContain('8'); // correctAnswer / step-two expected
    expect(output).toContain('3'); // step-one expected
  });

  it('marks the failed step distinctly from other steps', () => {
    const output = renderPrompt(makeContext(), PROMPT_TEMPLATES.uk);
    const lines = output.split('\n');
    const stepTwoLine = lines.find((l) => l.startsWith('2.'));
    const stepOneLine = lines.find((l) => l.startsWith('1.'));
    expect(stepTwoLine).toContain(PROMPT_TEMPLATES.uk.sectionLabels.failedStep);
    expect(stepOneLine).not.toContain(PROMPT_TEMPLATES.uk.sectionLabels.failedStep);
  });

  it('never presents the correct answer as the lead line of the prompt', () => {
    const output = renderPrompt(makeContext(), PROMPT_TEMPLATES.uk);
    const firstNonEmptyLine = output.split('\n').find((l) => l.trim().length > 0) ?? '';
    expect(firstNonEmptyLine).not.toContain(PROMPT_TEMPLATES.uk.sectionLabels.correctAnswer);
    expect(firstNonEmptyLine).not.toBe('8');
  });

  it('contains no personal-data fields — only the math-shaped ExplanationRequestContext fields', () => {
    const output = renderPrompt(makeContext(), PROMPT_TEMPLATES.uk);
    // The rendered prompt is built exclusively from template text + problem/steps/
    // answers/method — none of which carry a learner name, email, or device id.
    expect(output).not.toMatch(/@/); // no email-shaped content
  });

  it('substitutes {{language}} in the closing line with explanationLanguage', () => {
    const output = renderPrompt(
      makeContext({ explanationLanguage: 'en' }),
      PROMPT_TEMPLATES.uk,
    );
    expect(output).toContain(PROMPT_TEMPLATES.uk.closing.replace('{{language}}', 'en'));
    expect(output).not.toContain('{{language}}');
  });

  it('resolves a LocalizedRef method label via the default structural resolver', () => {
    const output = renderPrompt(makeContext(), PROMPT_TEMPLATES.uk);
    expect(output).toContain('method sum parts');
  });

  it('uses a plain string method label as-is when method is not a LocalizedRef', () => {
    const output = renderPrompt(
      makeContext({ method: 'Sum the parts' }),
      PROMPT_TEMPLATES.uk,
    );
    expect(output).toContain('Sum the parts');
  });

  it('accepts an injected resolveLocalizedRef for real catalog-resolved text', () => {
    const output = renderPrompt(makeContext(), PROMPT_TEMPLATES.uk, () => 'RESOLVED TEXT');
    expect(output).toContain('RESOLVED TEXT');
    expect(output).not.toContain('fruit eq prompt');
  });
});
