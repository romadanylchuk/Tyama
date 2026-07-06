/**
 * seeded-rng.ts — Deterministic seeded pseudo-random number generator.
 *
 * Implements `createSeededRng(seed: number): SeededRng` via the mulberry32
 * algorithm (DL-4: small, pure-JS, no dependencies, good distribution for
 * task generation, zero native surface, reproducible across platforms).
 *
 * EXEMPTION: This file is the sole legitimate site for low-level arithmetic
 * on float outputs within src/core/**. The `no-adhoc-number-format` ESLint
 * rule is turned off for src/core/rng/** in eslint.config.js.
 *
 * Generators MUST draw all randomness from a `SeededRng` instance — never
 * from `Math.random()` directly (enforced by the ESLint rule outside this
 * file). Property: createSeededRng(seed).next() produces an identical
 * sequence for the same seed on every call site and across JS environments.
 */

import type { SeededRng } from '@/core/types';

// ---------------------------------------------------------------------------
// mulberry32 — 32-bit seeded PRNG
// ---------------------------------------------------------------------------

/**
 * createSeededRng(seed: number): SeededRng
 *
 * Creates a new deterministic PRNG seeded with the given 32-bit integer seed.
 * The seed is truncated to a 32-bit unsigned integer via `>>> 0`.
 *
 * Properties:
 *   - Same seed → identical `next()` / `nextInt()` sequence, every time.
 *   - Different seeds → divergent sequences.
 *   - `next()` returns a float in [0, 1) (half-open; 1.0 is never returned).
 *   - `nextInt(min, max)` returns an integer in [min, max] (inclusive).
 *
 * Algorithm: mulberry32 by Tommy Ettinger (public domain).
 * Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 *
 * @param seed - A 32-bit integer seed. Non-integers and values outside [0, 2^32)
 *               are coerced via `>>> 0` (unsigned right-shift to 32-bit uint).
 */
export function createSeededRng(seed: number): SeededRng {
  // Coerce to 32-bit unsigned integer for a well-defined starting state.
  let state = seed >>> 0;

  /**
   * Advance the internal state and return the next float in [0, 1).
   *
   * mulberry32 core step:
   *   state += 0x6D2B79F5 (increment — constant from the algorithm)
   *   then mix the state through a series of xorshift/multiply operations.
   */
  function next(): number {
    // Advance state (wraps at 2^32 via JS's unsigned right-shift semantics).
    state = (state + 0x6D2B79F5) >>> 0;

    // Mix — all arithmetic kept in 32-bit range via >>> 0 and Math.imul.
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = (z ^ (z >>> 14)) >>> 0;

    // Convert to [0, 1) by dividing by 2^32.
    return z / 0x100000000;
  }

  /**
   * Return the next integer in [min, max] (inclusive).
   *
   * Uses `next()` to derive a uniform integer without bias for the MVP range
   * (range << 2^32, so the floor-multiply approach is precise enough).
   *
   * @param min - Inclusive lower bound (must be <= max; integer).
   * @param max - Inclusive upper bound (must be >= min; integer).
   */
  function nextInt(min: number, max: number): number {
    // Clamp defensively: if min > max, return min.
    if (min >= max) return min;
    const range = max - min + 1;
    return Math.floor(next() * range) + min;
  }

  return { next, nextInt };
}
