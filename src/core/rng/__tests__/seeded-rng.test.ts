/**
 * Unit tests for createSeededRng() — deterministic PRNG via mulberry32.
 *
 * Contract verified here:
 *   - Same seed → identical next() sequence and nextInt() sequence.
 *   - Different seeds → divergent sequences.
 *   - next() is always in [0, 1) (never returns 1.0 or negative).
 *   - nextInt(min, max) always in [min, max] inclusive.
 *   - Reproducibility across multiple generator instances (same seed re-created).
 */

import { createSeededRng } from '../seeded-rng';

// ---------------------------------------------------------------------------
// Determinism: same seed → identical sequence
// ---------------------------------------------------------------------------

describe('createSeededRng — same seed → identical sequence', () => {
  it('two instances with seed 42 produce the same next() sequence', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    for (let i = 0; i < 20; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('two instances with seed 0 produce the same next() sequence', () => {
    const rng1 = createSeededRng(0);
    const rng2 = createSeededRng(0);

    for (let i = 0; i < 10; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('two instances with seed 2147483647 (max 31-bit) produce the same next() sequence', () => {
    const rng1 = createSeededRng(2147483647);
    const rng2 = createSeededRng(2147483647);

    for (let i = 0; i < 10; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('re-creating with the same seed reproduces the full sequence', () => {
    const seed = 99999;
    const rng1 = createSeededRng(seed);
    const sequence1 = Array.from({ length: 30 }, () => rng1.next());

    const rng2 = createSeededRng(seed);
    const sequence2 = Array.from({ length: 30 }, () => rng2.next());

    expect(sequence1).toEqual(sequence2);
  });
});

// ---------------------------------------------------------------------------
// Determinism: different seeds → divergent sequences
// ---------------------------------------------------------------------------

describe('createSeededRng — different seeds → divergent sequences', () => {
  it('seed 1 and seed 2 produce different first values', () => {
    const rng1 = createSeededRng(1);
    const rng2 = createSeededRng(2);
    expect(rng1.next()).not.toBe(rng2.next());
  });

  it('seed 100 and seed 200 produce different sequences', () => {
    const rng1 = createSeededRng(100);
    const rng2 = createSeededRng(200);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    // Sequences must differ in at least one position.
    const allSame = seq1.every((v, i) => v === seq2[i]);
    expect(allSame).toBe(false);
  });

  it('seed 0 and seed 1 produce different sequences', () => {
    const rng1 = createSeededRng(0);
    const rng2 = createSeededRng(1);

    const seq1 = Array.from({ length: 5 }, () => rng1.next());
    const seq2 = Array.from({ length: 5 }, () => rng2.next());

    const allSame = seq1.every((v, i) => v === seq2[i]);
    expect(allSame).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Range: next() stays in [0, 1)
// ---------------------------------------------------------------------------

describe('createSeededRng — next() range [0, 1)', () => {
  it('all values from seed 42 are >= 0 and < 1 (1000 samples)', () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('all values from seed 0 are >= 0 and < 1 (1000 samples)', () => {
    const rng = createSeededRng(0);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces floats (not always integers) in the sequence', () => {
    const rng = createSeededRng(42);
    const values = Array.from({ length: 20 }, () => rng.next());
    const hasDecimal = values.some((v) => v !== Math.floor(v));
    expect(hasDecimal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// nextInt — inclusive bounds
// ---------------------------------------------------------------------------

describe('createSeededRng — nextInt(min, max) stays within [min, max]', () => {
  it('nextInt(1, 6) always returns 1..6 (1000 samples, seed 7)', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextInt(0, 100) always returns 0..100 (1000 samples, seed 13)', () => {
    const rng = createSeededRng(13);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(0, 100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextInt(5, 5) always returns 5 (single-value range)', () => {
    const rng = createSeededRng(99);
    for (let i = 0; i < 10; i++) {
      expect(rng.nextInt(5, 5)).toBe(5);
    }
  });

  it('nextInt(0, 1) returns only 0 or 1 (binary)', () => {
    const rng = createSeededRng(42);
    const results = new Set<number>();
    for (let i = 0; i < 100; i++) {
      results.add(rng.nextInt(0, 1));
    }
    // Both 0 and 1 must appear in 100 draws (astronomically unlikely to miss one).
    expect(results.has(0)).toBe(true);
    expect(results.has(1)).toBe(true);
    expect(results.size).toBe(2);
  });

  it('covers the full range of nextInt(1, 10) with enough samples', () => {
    const rng = createSeededRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      seen.add(rng.nextInt(1, 10));
    }
    for (let v = 1; v <= 10; v++) {
      expect(seen.has(v)).toBe(true);
    }
  });

  it('nextInt determinism: same seed → same sequence', () => {
    const rng1 = createSeededRng(77);
    const rng2 = createSeededRng(77);

    const seq1 = Array.from({ length: 20 }, () => rng1.nextInt(0, 50));
    const seq2 = Array.from({ length: 20 }, () => rng2.nextInt(0, 50));

    expect(seq1).toEqual(seq2);
  });

  it('nextInt(min > max) returns min (defensive clamping)', () => {
    const rng = createSeededRng(42);
    // Defensive: if caller passes inverted range, return min without crashing.
    const v = rng.nextInt(10, 5);
    expect(v).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// State progression: advancing next() changes subsequent outputs
// ---------------------------------------------------------------------------

describe('createSeededRng — state advances with each call', () => {
  it('successive next() calls return different values (not stuck)', () => {
    const rng = createSeededRng(12345);
    const a = rng.next();
    const b = rng.next();
    const c = rng.next();
    // Extremely unlikely to be equal for any valid PRNG.
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it('interleaving next() and nextInt() calls maintains determinism', () => {
    const rng1 = createSeededRng(555);
    const rng2 = createSeededRng(555);

    // Both must produce the same sequence when called identically.
    const results1: number[] = [];
    const results2: number[] = [];

    for (let i = 0; i < 10; i++) {
      results1.push(rng1.next());
      results1.push(rng1.nextInt(0, 9));
      results2.push(rng2.next());
      results2.push(rng2.nextInt(0, 9));
    }

    expect(results1).toEqual(results2);
  });
});
