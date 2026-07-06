/**
 * tokens.test.ts — Persona bundle completeness + resolvePersona() safe
 * degradation (Stage 06, Phase 2).
 */

import { PERSONAS, PERSONA_BUNDLES, resolvePersona } from '../tokens';
import { REGISTERS } from '@/i18n/catalog-types';

describe('PERSONA_BUNDLES completeness', () => {
  it('has a complete entry for every Persona', () => {
    for (const persona of PERSONAS) {
      expect(PERSONA_BUNDLES[persona]).toBeDefined();
    }
    expect(Object.keys(PERSONA_BUNDLES).sort()).toEqual([...PERSONAS].sort());
  });

  it('every bundle carries a valid Register', () => {
    for (const persona of PERSONAS) {
      const bundle = PERSONA_BUNDLES[persona];
      expect(REGISTERS).toContain(bundle.register);
    }
  });

  it('every bundle has complete light AND dark ThemeTokens (all four token groups)', () => {
    for (const persona of PERSONAS) {
      const bundle = PERSONA_BUNDLES[persona];
      for (const scheme of ['light', 'dark'] as const) {
        const tokens = bundle[scheme];
        expect(tokens.color).toBeDefined();
        expect(tokens.type).toBeDefined();
        expect(tokens.space).toBeDefined();
        expect(tokens.motion).toBeDefined();

        // Color group: every field is a non-empty string.
        for (const value of Object.values(tokens.color)) {
          expect(typeof value).toBe('string');
          expect((value as string).length).toBeGreaterThan(0);
        }
        // Type/space/motion groups: every field is a positive-or-defined value.
        expect(tokens.type.sizeSmall).toBeGreaterThan(0);
        expect(tokens.type.sizeBody).toBeGreaterThan(0);
        expect(tokens.type.sizeHeading).toBeGreaterThan(0);
        expect(tokens.space.xs).toBeGreaterThan(0);
        expect(tokens.motion.transitionFastMs).toBeGreaterThan(0);
        expect(tokens.motion.transitionStandardMs).toBeGreaterThan(0);
      }
    }
  });

  it('bundles are frozen (config-as-data, no runtime mutation)', () => {
    expect(Object.isFrozen(PERSONA_BUNDLES)).toBe(true);
    expect(Object.isFrozen(PERSONA_BUNDLES['adult-16+'])).toBe(true);
  });
});

describe('resolvePersona()', () => {
  it("maps the stored 'default' value to 'adult-16+'", () => {
    expect(resolvePersona('default')).toBe('adult-16+');
  });

  it('passes through every known persona value unchanged', () => {
    for (const persona of PERSONAS) {
      expect(resolvePersona(persona)).toBe(persona);
    }
  });

  it('safely degrades an unrecognized/malformed value to adult-16+ (never throws)', () => {
    expect(resolvePersona('not-a-real-persona')).toBe('adult-16+');
    expect(resolvePersona('')).toBe('adult-16+');
    expect(() => resolvePersona('garbage')).not.toThrow();
  });
});
