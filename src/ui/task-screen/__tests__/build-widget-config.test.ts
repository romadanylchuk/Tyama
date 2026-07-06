/**
 * build-widget-config.test.ts — buildWidgetConfig() pure synthesis tests
 * (Stage 06, Phase 6).
 *
 * Covers the Phase 6 completion criterion for build-widget-config.ts:
 *   - Each InputMode synthesizes the correct discriminated WidgetConfig variant.
 *   - Number/multi-slot decimalGlyph is sourced from the locale table.
 *   - finalOnly derives from Step.elicitFromMastery crossing abstractFade,
 *     ONLY at the abstract representation level.
 *   - Choice options include the canonical answer, sorted, deterministic.
 *   - Token palette includes digits + sign + (decimal glyph iff numberClass
 *     is 'decimal').
 *   - Manipulative model kind derives from step.skillNode.
 */

import { SCALAR_DECIMAL_POLICY, SCALAR_INTEGER_POLICY } from '@/core/canonical';
import type { GeneratedTask, Step } from '@/core/types';
import { DEFAULT_MASTERY_CONFIG } from '@/core/mastery/mastery-config';
import type {
  ChoiceWidgetConfig,
  ManipulativeWidgetConfig,
  MultiSlotWidgetConfig,
  NumberWidgetConfig,
  TokensWidgetConfig,
} from '@/widgets';
import { buildWidgetConfig } from '../build-widget-config';

function makeStep(overrides: Partial<Step>): Step {
  return {
    prompt: { key: 'test.step' },
    inputMode: 'number',
    expected: '7',
    skillNode: 'fruit-equations',
    elicitFromMastery: 0.2,
    normalizationPolicy: SCALAR_DECIMAL_POLICY,
    ...overrides,
  };
}

function makeTask(steps: Step[], representation: GeneratedTask['representation'] = 'abstract'): GeneratedTask {
  return {
    problem: { prompt: { key: 'test.problem' }, representation },
    solution: steps[steps.length - 1].expected,
    steps,
    representation,
    skillNode: steps[0].skillNode,
  };
}

describe('buildWidgetConfig', () => {
  it('number mode: decimalGlyph is sourced from the locale table', () => {
    const step = makeStep({ inputMode: 'number' });
    const task = makeTask([step]);
    const config = buildWidgetConfig(task, step, 'uk') as NumberWidgetConfig;
    expect(config.mode).toBe('number');
    expect(config.decimalGlyph).toBe(',');

    const enConfig = buildWidgetConfig(task, step, 'en') as NumberWidgetConfig;
    expect(enConfig.decimalGlyph).toBe('.');
  });

  it('finalOnly is false below abstractFade even at abstract representation', () => {
    const step = makeStep({ inputMode: 'number', elicitFromMastery: 0.5 });
    const task = makeTask([step], 'abstract');
    const config = buildWidgetConfig(task, step, 'uk') as NumberWidgetConfig;
    expect(config.finalOnly).toBe(false);
  });

  it('finalOnly is true at/above abstractFade AND abstract representation', () => {
    const step = makeStep({
      inputMode: 'number',
      elicitFromMastery: DEFAULT_MASTERY_CONFIG.abstractFade,
    });
    const task = makeTask([step], 'abstract');
    const config = buildWidgetConfig(task, step, 'uk') as NumberWidgetConfig;
    expect(config.finalOnly).toBe(true);
  });

  it('finalOnly is false at pictorial representation even above the abstractFade scalar', () => {
    const step = makeStep({
      inputMode: 'number',
      elicitFromMastery: 0.95,
    });
    const task = makeTask([step], 'pictorial');
    const config = buildWidgetConfig(task, step, 'uk') as NumberWidgetConfig;
    expect(config.finalOnly).toBe(false);
  });

  it('choice mode: options include the canonical answer, sorted ascending, deterministic', () => {
    const step = makeStep({ inputMode: 'choice', expected: '5', normalizationPolicy: SCALAR_INTEGER_POLICY });
    const task = makeTask([step]);
    const config1 = buildWidgetConfig(task, step, 'uk') as ChoiceWidgetConfig;
    const config2 = buildWidgetConfig(task, step, 'uk') as ChoiceWidgetConfig;

    expect(config1.mode).toBe('choice');
    expect(config1.options.map((o) => o.id)).toContain('5');
    const values = config1.options.map((o) => Number(o.id));
    expect([...values]).toEqual([...values].sort((a, b) => a - b));
    // Deterministic: identical input -> identical output (no randomness).
    expect(config2).toEqual(config1);
  });

  it('tokens mode (decimal numberClass): palette includes digits, sign, and the decimal glyph', () => {
    const step = makeStep({
      inputMode: 'tokens',
      normalizationPolicy: SCALAR_DECIMAL_POLICY,
    });
    const task = makeTask([step]);
    const config = buildWidgetConfig(task, step, 'uk') as TokensWidgetConfig;
    const ids = config.palette.map((t) => t.id);

    expect(config.mode).toBe('tokens');
    for (const digit of '0123456789') {
      expect(ids).toContain(digit);
    }
    expect(ids).toContain('-');
    expect(ids).toContain(','); // uk decimal separator
  });

  it('tokens mode (integer numberClass): palette omits the decimal glyph', () => {
    const step = makeStep({
      inputMode: 'tokens',
      normalizationPolicy: SCALAR_INTEGER_POLICY,
    });
    const task = makeTask([step]);
    const config = buildWidgetConfig(task, step, 'uk') as TokensWidgetConfig;
    const ids = config.palette.map((t) => t.id);
    expect(ids).not.toContain(',');
  });

  it('manipulative mode: kind derives from skillNode (fraction-simplification -> fraction-bar)', () => {
    const step = makeStep({
      inputMode: 'manipulative',
      skillNode: 'fraction-simplification',
      normalizationPolicy: SCALAR_INTEGER_POLICY,
    });
    const task = makeTask([step]);
    const config = buildWidgetConfig(task, step, 'uk') as ManipulativeWidgetConfig;
    expect(config.mode).toBe('manipulative');
    expect(config.model.kind).toBe('fraction-bar');
  });

  it('manipulative mode: kind derives from skillNode (any other node -> number-bond)', () => {
    const step = makeStep({
      inputMode: 'manipulative',
      skillNode: 'number-bonds',
      normalizationPolicy: SCALAR_INTEGER_POLICY,
    });
    const task = makeTask([step]);
    const config = buildWidgetConfig(task, step, 'uk') as ManipulativeWidgetConfig;
    expect(config.model.kind).toBe('number-bond');
  });

  it('manipulative mode: model.payload forwards step.prompt.vars verbatim', () => {
    const step = makeStep({
      inputMode: 'manipulative',
      skillNode: 'number-bonds',
      normalizationPolicy: SCALAR_INTEGER_POLICY,
      prompt: { key: 'number_bonds.step.whole', vars: { knownA: 3, knownB: 4 } },
    });
    const task = makeTask([step]);
    const config = buildWidgetConfig(task, step, 'uk') as ManipulativeWidgetConfig;
    expect(config.model.payload).toEqual({ knownA: 3, knownB: 4 });
  });

  it('multi-slot mode: builds one slot per multi-slot step in the task, ignoring the passed-in single step', () => {
    const stepA = makeStep({
      inputMode: 'multi-slot',
      skillNode: 'fraction-simplification',
      expected: '3',
      normalizationPolicy: SCALAR_INTEGER_POLICY,
    });
    const stepB = makeStep({
      inputMode: 'multi-slot',
      skillNode: 'fraction-simplification',
      expected: '8',
      normalizationPolicy: SCALAR_INTEGER_POLICY,
    });
    const task = makeTask([stepA, stepB]);
    const config = buildWidgetConfig(task, stepA, 'uk') as MultiSlotWidgetConfig;
    expect(config.mode).toBe('multi-slot');
    expect(config.slots).toHaveLength(2);
    expect(config.slots[0].decimalGlyph).toBe(',');
  });

  it('is pure: identical arguments always produce a deep-equal WidgetConfig', () => {
    const step = makeStep({ inputMode: 'number' });
    const task = makeTask([step]);
    const first = buildWidgetConfig(task, step, 'uk');
    const second = buildWidgetConfig(task, step, 'uk');
    expect(second).toEqual(first);
  });
});
