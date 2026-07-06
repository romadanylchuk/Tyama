/**
 * Unit tests for canonicalizeFraction() and SCALAR_INTEGER_POLICY.
 *
 * canonicalizeFraction is the SOLE fraction-emission site in the Tyama domain core.
 * Both the fraction generator (task.solution) and stage-05's checker fraction branch
 * (normalizing the learner's numerator/denominator inputs) import this function.
 * Divergence between generation and checking is impossible by construction.
 *
 * Rule reference: CANONICAL_NUMBER_STANDARD R7 in canonical-number.ts
 */

import {
  canonicalizeFraction,
  SCALAR_INTEGER_POLICY,
  CanonicalError,
  NormalizationPolicy,
} from '../canonical-number';

// ---------------------------------------------------------------------------
// Basic reduction (lowest terms)
// ---------------------------------------------------------------------------

describe('canonicalizeFraction — lowest-terms reduction', () => {
  it('(1, 2) -> "1/2" (already reduced)', () => {
    expect(canonicalizeFraction(1, 2)).toBe('1/2');
  });

  it('(2, 4) -> "1/2" (reduces by gcd=2)', () => {
    expect(canonicalizeFraction(2, 4)).toBe('1/2');
  });

  it('(6, 8) -> "3/4" (reduces by gcd=2)', () => {
    expect(canonicalizeFraction(6, 8)).toBe('3/4');
  });

  it('(3, 7) -> "3/7" (already reduced; passes through unchanged)', () => {
    expect(canonicalizeFraction(3, 7)).toBe('3/7');
  });

  it('(10, 25) -> "2/5" (reduces by gcd=5)', () => {
    expect(canonicalizeFraction(10, 25)).toBe('2/5');
  });

  it('(100, 200) -> "1/2" (large reducible fraction)', () => {
    expect(canonicalizeFraction(100, 200)).toBe('1/2');
  });
});

// ---------------------------------------------------------------------------
// Integer collapse (q === 1)
// ---------------------------------------------------------------------------

describe('canonicalizeFraction — q===1 collapses to integer via canonicalize()', () => {
  it('(4, 1) -> "4" (already integer denominator)', () => {
    expect(canonicalizeFraction(4, 1)).toBe('4');
  });

  it('(4, 2) -> "2" (reduces 4/2 -> 2/1 -> integer "2")', () => {
    expect(canonicalizeFraction(4, 2)).toBe('2');
  });

  it('(9, 3) -> "3" (reduces 9/3 -> 3/1 -> integer "3")', () => {
    expect(canonicalizeFraction(9, 3)).toBe('3');
  });

  it('(6, 2) -> "3" (reduces 6/2 -> 3/1 -> integer "3")', () => {
    expect(canonicalizeFraction(6, 2)).toBe('3');
  });

  it('(-4, 2) -> "-2" (negative integer collapse)', () => {
    expect(canonicalizeFraction(-4, 2)).toBe('-2');
  });

  it('(-6, 3) -> "-2" (negative integer collapse via gcd)', () => {
    expect(canonicalizeFraction(-6, 3)).toBe('-2');
  });
});

// ---------------------------------------------------------------------------
// Sign normalization (all 4 sign combinations)
// ---------------------------------------------------------------------------

describe('canonicalizeFraction — sign normalization (sign lives on numerator)', () => {
  it('(-1, 2) -> "-1/2" (negative numerator, positive denominator)', () => {
    expect(canonicalizeFraction(-1, 2)).toBe('-1/2');
  });

  it('(1, -2) -> "-1/2" (positive numerator, negative denominator -> sign moved to num)', () => {
    expect(canonicalizeFraction(1, -2)).toBe('-1/2');
  });

  it('(-3, 4) -> "-3/4" (neg/pos)', () => {
    expect(canonicalizeFraction(-3, 4)).toBe('-3/4');
  });

  it('(3, -4) -> "-3/4" (pos/neg -> sign moved to numerator)', () => {
    expect(canonicalizeFraction(3, -4)).toBe('-3/4');
  });

  it('(-3, -4) -> "3/4" (neg/neg -> double negative -> positive)', () => {
    expect(canonicalizeFraction(-3, -4)).toBe('3/4');
  });

  it('(3, 4) -> "3/4" (pos/pos -> positive)', () => {
    expect(canonicalizeFraction(3, 4)).toBe('3/4');
  });

  it('(-2, 4) -> "-1/2" (sign + reduction combined)', () => {
    expect(canonicalizeFraction(-2, 4)).toBe('-1/2');
  });

  it('(2, -4) -> "-1/2" (negative denominator + reduction combined)', () => {
    expect(canonicalizeFraction(2, -4)).toBe('-1/2');
  });

  it('(-2, -4) -> "1/2" (double negative + reduction)', () => {
    expect(canonicalizeFraction(-2, -4)).toBe('1/2');
  });
});

// ---------------------------------------------------------------------------
// Zero numerator
// ---------------------------------------------------------------------------

describe('canonicalizeFraction — zero numerator', () => {
  it('(0, 5) -> "0" (zero is sign-neutral)', () => {
    expect(canonicalizeFraction(0, 5)).toBe('0');
  });

  it('(0, -5) -> "0" (negative denominator irrelevant when numerator is zero)', () => {
    expect(canonicalizeFraction(0, -5)).toBe('0');
  });

  it('(0, 1) -> "0"', () => {
    expect(canonicalizeFraction(0, 1)).toBe('0');
  });

  it('(0, 100) -> "0" (large denominator, zero numerator)', () => {
    expect(canonicalizeFraction(0, 100)).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Zero denominator — throws CanonicalError
// ---------------------------------------------------------------------------

describe('canonicalizeFraction — denominator === 0 throws CanonicalError', () => {
  it('(5, 0) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(5, 0)).toThrow(CanonicalError);
  });

  it('(1, 0) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(1, 0)).toThrow(CanonicalError);
  });

  it('(-1, 0) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(-1, 0)).toThrow(CanonicalError);
  });

  it('(0, 0) throws CanonicalError (zero/zero is indeterminate — programmer error)', () => {
    expect(() => canonicalizeFraction(0, 0)).toThrow(CanonicalError);
  });

  it('thrown error has name "CanonicalError"', () => {
    expect(() => canonicalizeFraction(5, 0)).toThrow(
      expect.objectContaining({ name: 'CanonicalError' })
    );
  });

  it('thrown error message mentions denominator', () => {
    expect(() => canonicalizeFraction(5, 0)).toThrow(/denominator/i);
  });
});

// ---------------------------------------------------------------------------
// Non-integer arguments — throws CanonicalError
// ---------------------------------------------------------------------------

describe('canonicalizeFraction — non-integer args throw CanonicalError', () => {
  it('(0.5, 2) throws CanonicalError (non-integer numerator)', () => {
    expect(() => canonicalizeFraction(0.5, 2)).toThrow(CanonicalError);
  });

  it('(1, 0.5) throws CanonicalError (non-integer denominator)', () => {
    expect(() => canonicalizeFraction(1, 0.5)).toThrow(CanonicalError);
  });

  it('(1.1, 3) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(1.1, 3)).toThrow(CanonicalError);
  });

  it('(3, 1.1) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(3, 1.1)).toThrow(CanonicalError);
  });
});

// ---------------------------------------------------------------------------
// Non-finite arguments — throws CanonicalError
// ---------------------------------------------------------------------------

describe('canonicalizeFraction — non-finite args throw CanonicalError', () => {
  it('(NaN, 2) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(NaN, 2)).toThrow(CanonicalError);
  });

  it('(1, NaN) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(1, NaN)).toThrow(CanonicalError);
  });

  it('(Infinity, 2) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(Infinity, 2)).toThrow(CanonicalError);
  });

  it('(1, Infinity) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(1, Infinity)).toThrow(CanonicalError);
  });

  it('(-Infinity, 2) throws CanonicalError', () => {
    expect(() => canonicalizeFraction(-Infinity, 2)).toThrow(CanonicalError);
  });
});

// ---------------------------------------------------------------------------
// GCD reduction correctness
// ---------------------------------------------------------------------------

describe('canonicalizeFraction — gcd reduction correctness', () => {
  it('(12, 8) -> "3/2" (gcd=4)', () => {
    expect(canonicalizeFraction(12, 8)).toBe('3/2');
  });

  it('(7, 14) -> "1/2" (gcd=7)', () => {
    expect(canonicalizeFraction(7, 14)).toBe('1/2');
  });

  it('(15, 10) -> "3/2" (gcd=5)', () => {
    expect(canonicalizeFraction(15, 10)).toBe('3/2');
  });

  it('(5, 7) -> "5/7" (gcd=1, coprime)', () => {
    expect(canonicalizeFraction(5, 7)).toBe('5/7');
  });

  it('(21, 14) -> "3/2" (gcd=7)', () => {
    expect(canonicalizeFraction(21, 14)).toBe('3/2');
  });
});

// ---------------------------------------------------------------------------
// SCALAR_INTEGER_POLICY field assertions
// ---------------------------------------------------------------------------

describe('SCALAR_INTEGER_POLICY', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(SCALAR_INTEGER_POLICY)).toBe(true);
  });

  it('has decimalForm "standard"', () => {
    expect(SCALAR_INTEGER_POLICY.decimalForm).toBe('standard');
  });

  it('has ordering "n/a"', () => {
    expect(SCALAR_INTEGER_POLICY.ordering).toBe('n/a');
  });

  it('has lowestTerms false (integer steps do not require fraction reduction)', () => {
    expect(SCALAR_INTEGER_POLICY.lowestTerms).toBe(false);
  });

  it('has numberClass "integer"', () => {
    expect(SCALAR_INTEGER_POLICY.numberClass).toBe('integer');
  });

  it('satisfies NormalizationPolicy interface (type-level smoke)', () => {
    const policy: NormalizationPolicy = SCALAR_INTEGER_POLICY;
    expect(policy).toBeDefined();
  });
});
