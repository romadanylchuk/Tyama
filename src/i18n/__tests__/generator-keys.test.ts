/**
 * generator-keys.test.ts — completeness gate for the content/widget i18n keys.
 *
 * The domain core emits language-neutral prompt keys (LocalizedRef.key) and the
 * widgets render chrome via fixed `widget.*` keys. If a catalog entry is
 * missing, i18next silently echoes the raw key on screen (e.g. the learner sees
 * "fruit_eq.problem.unknowns_1" instead of a real prompt). This test pins the
 * full enumerated key space so a missing translation fails the build.
 *
 * WHEN ADDING A GENERATOR OR WIDGET LABEL: add its key(s) here AND to uk.ts
 * (en.ts is additive and falls back to uk, so uk is the load-bearing catalog).
 *
 * NOTE: numeric choice/token labels are deliberately EXCLUDED — build-widget-
 * config.ts uses the numeral/glyph string itself as the key ("7", ",", "-"),
 * which i18next correctly renders verbatim (a digit is locale-invariant).
 */

import uk from '../locales/uk';
import en from '../locales/en';

/**
 * Every non-numeric i18n key the generators and widgets can emit at runtime.
 * Dynamic keys are fully expanded (all slot/unknowns/kind permutations).
 */
const REQUIRED_KEYS: readonly string[] = [
  // number-bonds — slot ∈ {part_a, part_b, whole}
  'number_bonds.problem.part_a',
  'number_bonds.problem.part_b',
  'number_bonds.problem.whole',
  'number_bonds.step.part_a',
  'number_bonds.step.part_b',
  'number_bonds.step.whole',
  // multiplication
  'multiplication.problem',
  'multiplication.step.product',
  // fraction-simplification
  'fraction_simpl.problem',
  'fraction_simpl.step.numerator',
  'fraction_simpl.step.denominator',
  // fruit-equations — unknowns ∈ {1, 2}, slot ∈ {apple, banana}
  'fruit_eq.problem.unknowns_1',
  'fruit_eq.problem.unknowns_2',
  'fruit_eq.step.apple',
  'fruit_eq.step.banana',
  // widget chrome (rendered via useT() in the widgets)
  'widget.confirm',
  'widget.backspace',
  'widget.number.final_only',
  'widget.manipulative.interact',
  'widget.manipulative.interacted',
  'widget.manipulative.number-bond',
  'widget.manipulative.fraction-bar',
  'widget.tokens.tap_to_assemble',
  'widget.tokens.remove_last',
];

describe('generator + widget i18n key completeness', () => {
  it.each(REQUIRED_KEYS)('uk catalog defines a non-empty string for "%s"', (key) => {
    expect(Object.prototype.hasOwnProperty.call(uk, key)).toBe(true);
    expect(typeof uk[key]).toBe('string');
    expect((uk[key] as string).length).toBeGreaterThan(0);
  });

  it('every en entry for these keys (when present) is a non-empty string', () => {
    for (const key of REQUIRED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(en, key)) {
        expect(typeof en[key]).toBe('string');
        expect((en[key] as string).length).toBeGreaterThan(0);
      }
    }
  });
});
