/**
 * anti-shame-tokens.test.ts — error-feedback visual spec assertions
 * (Stage 06, Phase 2).
 *
 * Asserts: no token value contains forbidden vocabulary or a dominant-red
 * hex sentinel; the timing beat is always > 0 (never a same-millisecond
 * flash).
 */

import {
  ANTI_SHAME_FEEDBACK_LIGHT,
  ANTI_SHAME_FEEDBACK_DARK,
  resolveAntiShameFeedback,
  FORBIDDEN_FEEDBACK_VOCAB,
  containsForbiddenVocab,
  isDominantRedHex,
} from '../anti-shame-tokens';
import { PERSONA_BUNDLES, PERSONAS } from '../tokens';

describe('anti-shame feedback tokens', () => {
  it.each([
    ['light', ANTI_SHAME_FEEDBACK_LIGHT],
    ['dark', ANTI_SHAME_FEEDBACK_DARK],
  ])('%s: timingBeatMs is > 0 (never a same-millisecond flash)', (_label, tokens) => {
    expect(tokens.timingBeatMs).toBeGreaterThan(0);
    expect(tokens.transitionMs).toBeGreaterThan(0);
  });

  it('resolveAntiShameFeedback() returns the matching scheme tokens', () => {
    expect(resolveAntiShameFeedback('light')).toBe(ANTI_SHAME_FEEDBACK_LIGHT);
    expect(resolveAntiShameFeedback('dark')).toBe(ANTI_SHAME_FEEDBACK_DARK);
  });

  it('no anti-shame feedback token value contains forbidden vocabulary', () => {
    for (const tokens of [ANTI_SHAME_FEEDBACK_LIGHT, ANTI_SHAME_FEEDBACK_DARK]) {
      expect(containsForbiddenVocab(tokens.calmAccent)).toBe(false);
      expect(containsForbiddenVocab(tokens.calmSurface)).toBe(false);
    }
  });

  it('no anti-shame feedback color is a dominant-red hex sentinel', () => {
    for (const tokens of [ANTI_SHAME_FEEDBACK_LIGHT, ANTI_SHAME_FEEDBACK_DARK]) {
      expect(isDominantRedHex(tokens.calmAccent)).toBe(false);
      expect(isDominantRedHex(tokens.calmSurface)).toBe(false);
    }
  });

  it('bundles are frozen (config-as-data)', () => {
    expect(Object.isFrozen(ANTI_SHAME_FEEDBACK_LIGHT)).toBe(true);
    expect(Object.isFrozen(ANTI_SHAME_FEEDBACK_DARK)).toBe(true);
    expect(Object.isFrozen(FORBIDDEN_FEEDBACK_VOCAB)).toBe(true);
  });
});

describe('FORBIDDEN_FEEDBACK_VOCAB', () => {
  it('contains the exact vocabulary named by the anti-shame invariant', () => {
    for (const word of ['wrong', 'red', '✗', 'buzzer', 'shake', 'locked', 'padlock', 'penalty', 'subtract', 'deducted']) {
      expect(FORBIDDEN_FEEDBACK_VOCAB).toContain(word);
    }
  });
});

describe('containsForbiddenVocab()', () => {
  it('is case-insensitive and matches substrings', () => {
    expect(containsForbiddenVocab('This is WRONG')).toBe(true);
    expect(containsForbiddenVocab('Locked out')).toBe(true);
    expect(containsForbiddenVocab('everything is calm and fine')).toBe(false);
  });
});

describe('isDominantRedHex()', () => {
  it('flags alarm-red hex values', () => {
    expect(isDominantRedHex('#ff0000')).toBe(true);
    expect(isDominantRedHex('#f00')).toBe(true);
    expect(isDominantRedHex('#e63946')).toBe(true);
  });

  it('does not flag muted/desaturated accents (including warm oranges)', () => {
    expect(isDominantRedHex('#3E7CB1')).toBe(false); // calm blue
    expect(isDominantRedHex('#2F7A6B')).toBe(false); // teal accent
    expect(isDominantRedHex('#F5A623')).toBe(false); // orange (kid persona) — not alarm-red
  });

  it('does not throw and returns false for non-hex input', () => {
    expect(() => isDominantRedHex('not-a-color')).not.toThrow();
    expect(isDominantRedHex('not-a-color')).toBe(false);
  });
});

describe('no PERSONA_BUNDLES color token is a dominant-red hex sentinel', () => {
  it('checks every color field of every persona × scheme', () => {
    for (const persona of PERSONAS) {
      const bundle = PERSONA_BUNDLES[persona];
      for (const scheme of ['light', 'dark'] as const) {
        for (const value of Object.values(bundle[scheme].color)) {
          expect(isDominantRedHex(value)).toBe(false);
        }
      }
    }
  });
});
