/**
 * prompt-templates.test.ts — config-as-data prompt-template asset (Stage 06, Phase 3).
 *
 * Asserts: `uk` default is present and complete; `resolvePromptTemplate` falls
 * back to `uk` for an unrecognised/absent explanationLanguage; never throws.
 */

import { PROMPT_TEMPLATES, resolvePromptTemplate } from '../prompt-templates';

describe('PROMPT_TEMPLATES', () => {
  it('ships a uk default and an en addition', () => {
    expect(PROMPT_TEMPLATES.uk).toBeDefined();
    expect(PROMPT_TEMPLATES.en).toBeDefined();
  });

  it('every shipped template has non-empty intro/instructionMeta/closing and full section labels', () => {
    for (const template of Object.values(PROMPT_TEMPLATES)) {
      expect(template.intro.length).toBeGreaterThan(0);
      expect(template.instructionMeta.length).toBeGreaterThan(0);
      expect(template.differentModality.length).toBeGreaterThan(0);
      expect(template.closing).toContain('{{language}}');
      expect(template.sectionLabels.problem.length).toBeGreaterThan(0);
      expect(template.sectionLabels.steps.length).toBeGreaterThan(0);
      expect(template.sectionLabels.failedStep.length).toBeGreaterThan(0);
      expect(template.sectionLabels.studentAnswer.length).toBeGreaterThan(0);
      expect(template.sectionLabels.correctAnswer.length).toBeGreaterThan(0);
      expect(template.sectionLabels.method.length).toBeGreaterThan(0);
    }
  });

  it('templates are frozen (config-as-data)', () => {
    expect(Object.isFrozen(PROMPT_TEMPLATES.uk)).toBe(true);
    expect(Object.isFrozen(PROMPT_TEMPLATES.uk.sectionLabels)).toBe(true);
    expect(Object.isFrozen(PROMPT_TEMPLATES.en)).toBe(true);
  });
});

describe('resolvePromptTemplate()', () => {
  it('resolves an exact primary-subtag match', () => {
    expect(resolvePromptTemplate('uk')).toBe(PROMPT_TEMPLATES.uk);
    expect(resolvePromptTemplate('en')).toBe(PROMPT_TEMPLATES.en);
  });

  it('matches on the primary subtag, ignoring region (e.g. en-US -> en)', () => {
    expect(resolvePromptTemplate('en-US')).toBe(PROMPT_TEMPLATES.en);
    expect(resolvePromptTemplate('uk-UA')).toBe(PROMPT_TEMPLATES.uk);
  });

  it('is case-insensitive', () => {
    expect(resolvePromptTemplate('EN-us')).toBe(PROMPT_TEMPLATES.en);
  });

  it('falls back to uk for an unrecognised language tag — never blocks explain()', () => {
    expect(resolvePromptTemplate('zz')).toBe(PROMPT_TEMPLATES.uk);
    expect(resolvePromptTemplate('fr-FR')).toBe(PROMPT_TEMPLATES.uk);
  });

  it('falls back to uk for an empty or malformed input, never throws', () => {
    expect(() => resolvePromptTemplate('')).not.toThrow();
    expect(resolvePromptTemplate('')).toBe(PROMPT_TEMPLATES.uk);
    // @ts-expect-error — defensive runtime test against a non-string caller mistake
    expect(() => resolvePromptTemplate(undefined)).not.toThrow();
  });
});
