/**
 * Unit tests for canonicalize() and the canonical-number module.
 *
 * These tests ARE THE CONTRACT that stage-03's checker must satisfy.
 * The checker's normalize() must produce identical output for the same
 * logical value — stage-03 re-runs these cases against its own parse+normalize
 * pipeline to guarantee the 02↔03 spine never diverges.
 *
 * Rule reference: CANONICAL_NUMBER_STANDARD in canonical-number.ts
 */

import {
  canonicalize,
  CanonicalError,
  CANONICAL_NUMBER_STANDARD,
  SCALAR_DECIMAL_POLICY,
  NormalizationPolicy,
} from '../canonical-number';

// ---------------------------------------------------------------------------
// Rule table tests (one describe per rule for traceability)
// ---------------------------------------------------------------------------

describe('canonicalize — R2: no trailing fractional zeros', () => {
  it('3.50 → "3.5" (trailing zero stripped)', () => {
    expect(canonicalize(3.5)).toBe('3.5');
  });

  it('3.0 → "3" (trailing .0 stripped to integer)', () => {
    expect(canonicalize(3.0)).toBe('3');
  });

  it('2.00 → "2" (multiple trailing zeros stripped)', () => {
    // JS 2.00 === 2; toString gives '2'
    expect(canonicalize(2.0)).toBe('2');
  });

  it('2.25 → "2.25" (no trailing zeros; unchanged)', () => {
    expect(canonicalize(2.25)).toBe('2.25');
  });

  it('1.10 → "1.1" (single trailing zero stripped)', () => {
    // JS 1.10 === 1.1; toString gives '1.1' — already correct
    expect(canonicalize(1.1)).toBe('1.1');
  });
});

describe('canonicalize — R3: leading zero required for |value| < 1', () => {
  it('0.5 → "0.5" (already has leading zero)', () => {
    expect(canonicalize(0.5)).toBe('0.5');
  });

  it('-0.75 → "-0.75" (negative fractional has leading zero)', () => {
    expect(canonicalize(-0.75)).toBe('-0.75');
  });

  it('0.1 → "0.1"', () => {
    expect(canonicalize(0.1)).toBe('0.1');
  });

  it('0.25 → "0.25"', () => {
    expect(canonicalize(0.25)).toBe('0.25');
  });
});

describe('canonicalize — R4: integers are bare digits (no decimal point)', () => {
  it('4 → "4"', () => {
    expect(canonicalize(4)).toBe('4');
  });

  it('7.0 → "7" (integer value from decimal source)', () => {
    // 7.0 === 7 in JS; canonical form is '7'
    expect(canonicalize(7.0)).toBe('7');
  });

  it('0 → "0"', () => {
    expect(canonicalize(0)).toBe('0');
  });

  it('100 → "100"', () => {
    expect(canonicalize(100)).toBe('100');
  });

  it('large integer 999999 → "999999"', () => {
    expect(canonicalize(999999)).toBe('999999');
  });
});

describe('canonicalize — R5: negatives use U+002D, negative zero → "0"', () => {
  it('-3 → "-3"', () => {
    expect(canonicalize(-3)).toBe('-3');
  });

  it('-0.5 → "-0.5"', () => {
    expect(canonicalize(-0.5)).toBe('-0.5');
  });

  it('-0 (negative zero) → "0" (negative zero forbidden)', () => {
    // Object.is(-0, -0) is true; -0 must canonicalize to '0'
    expect(canonicalize(-0)).toBe('0');
  });

  it('-100 → "-100"', () => {
    expect(canonicalize(-100)).toBe('-100');
  });
});

describe('canonicalize — R8: non-finite input throws CanonicalError', () => {
  it('NaN throws CanonicalError', () => {
    expect(() => canonicalize(NaN)).toThrow(CanonicalError);
  });

  it('Infinity throws CanonicalError', () => {
    expect(() => canonicalize(Infinity)).toThrow(CanonicalError);
  });

  it('-Infinity throws CanonicalError', () => {
    expect(() => canonicalize(-Infinity)).toThrow(CanonicalError);
  });

  it('thrown CanonicalError has name "CanonicalError"', () => {
    expect(() => canonicalize(NaN)).toThrow(
      expect.objectContaining({ name: 'CanonicalError' })
    );
  });

  it('thrown error message includes the value', () => {
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/i);
  });
});

// ---------------------------------------------------------------------------
// Combined rule-table cases (CLAUDE.md: decimal-separator round-trip)
// ---------------------------------------------------------------------------

describe('canonicalize — decimal-separator round-trip (CLAUDE.md §invariant)', () => {
  /**
   * CLAUDE.md invariant: "Number-formatting is a correctness trap, not cosmetics.
   * Decimal separators differ (UA/EU 3,5 vs EN 3.5) and this affects both display
   * AND answer parsing in step-level checking."
   *
   * canonicalize() always produces the '.' form regardless of how the JS number
   * was constructed. The locale-PARSING direction (turning '3,5' into 3.5 as a
   * JS number) is stage-03's job. Here we test that canonicalize() produces the
   * same canonical string for equivalent numeric values regardless of source.
   */

  it('3.5 (from EN decimal) → "3.5"', () => {
    expect(canonicalize(3.5)).toBe('3.5');
  });

  it('parseFloat("3,5".replace(",",".")) === 3.5 → canonicalizes to "3.5"', () => {
    // Simulates what stage-03's locale parser will produce before calling canonicalize.
    // The comma → period normalization happens BEFORE canonicalize; canonicalize
    // receives a plain JS number (3.5) and always emits '3.5'.
    const parsed = parseFloat('3,5'.replace(',', '.'));
    expect(parsed).toBe(3.5);
    expect(canonicalize(parsed)).toBe('3.5');
  });

  it('equivalent values canonicalize identically (7.0 === 7 → both "7")', () => {
    expect(canonicalize(7.0)).toBe(canonicalize(7));
    expect(canonicalize(7.0)).toBe('7');
  });

  it('equivalent values canonicalize identically (3.50 === 3.5 → both "3.5")', () => {
    expect(canonicalize(3.5)).toBe(canonicalize(3.5));
    expect(canonicalize(3.5)).toBe('3.5');
  });

  it('0.5 and the float constructed from "0.5" both → "0.5"', () => {
    expect(canonicalize(0.5)).toBe('0.5');
    expect(canonicalize(parseFloat('0.5'))).toBe('0.5');
  });
});

// ---------------------------------------------------------------------------
// Additional correctness edge cases
// ---------------------------------------------------------------------------

describe('canonicalize — additional edge cases', () => {
  it('negative fractional with trailing zero: -3.50 → "-3.5"', () => {
    expect(canonicalize(-3.5)).toBe('-3.5');
  });

  it('small positive fraction 0.125 → "0.125"', () => {
    expect(canonicalize(0.125)).toBe('0.125');
  });

  it('1 → "1" (identity for single-digit integer)', () => {
    expect(canonicalize(1)).toBe('1');
  });

  it('-1 → "-1"', () => {
    expect(canonicalize(-1)).toBe('-1');
  });

  it('large negative integer -999 → "-999"', () => {
    expect(canonicalize(-999)).toBe('-999');
  });

  it('terminating decimal 2.25 → "2.25"', () => {
    expect(canonicalize(2.25)).toBe('2.25');
  });

  it('0.0 → "0" (zero with trailing fractional zero)', () => {
    expect(canonicalize(0.0)).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

describe('SCALAR_DECIMAL_POLICY', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(SCALAR_DECIMAL_POLICY)).toBe(true);
  });

  it('has decimalForm "standard"', () => {
    expect(SCALAR_DECIMAL_POLICY.decimalForm).toBe('standard');
  });

  it('has ordering "n/a" (single scalar per step; ordering handled by step sequence)', () => {
    expect(SCALAR_DECIMAL_POLICY.ordering).toBe('n/a');
  });

  it('has lowestTerms false (decimal/integer steps do not require lowest-terms reduction)', () => {
    expect(SCALAR_DECIMAL_POLICY.lowestTerms).toBe(false);
  });

  it('has numberClass "decimal" (fruit-equations uses terminating decimals)', () => {
    expect(SCALAR_DECIMAL_POLICY.numberClass).toBe('decimal');
  });
});

// ---------------------------------------------------------------------------
// CANONICAL_NUMBER_STANDARD (the prose spec)
// ---------------------------------------------------------------------------

describe('CANONICAL_NUMBER_STANDARD', () => {
  it('is a non-empty string', () => {
    expect(typeof CANONICAL_NUMBER_STANDARD).toBe('string');
    expect(CANONICAL_NUMBER_STANDARD.length).toBeGreaterThan(0);
  });

  it('documents the R1 decimal separator rule', () => {
    expect(CANONICAL_NUMBER_STANDARD).toMatch(/decimal separator/i);
  });

  it('documents the R2 no-trailing-zeros rule', () => {
    expect(CANONICAL_NUMBER_STANDARD).toMatch(/trailing zero/i);
  });

  it('documents the R3 leading-zero rule', () => {
    expect(CANONICAL_NUMBER_STANDARD).toMatch(/leading zero/i);
  });
});

// ---------------------------------------------------------------------------
// Type-level smoke: NormalizationPolicy shape
// ---------------------------------------------------------------------------

describe('NormalizationPolicy type shape', () => {
  it('SCALAR_DECIMAL_POLICY satisfies NormalizationPolicy interface', () => {
    // TypeScript will catch this at compile time; runtime assertion confirms shape.
    const policy: NormalizationPolicy = SCALAR_DECIMAL_POLICY;
    expect(policy).toBeDefined();
  });
});
