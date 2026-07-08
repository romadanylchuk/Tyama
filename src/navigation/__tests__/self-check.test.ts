/**
 * self-check.test.ts — pure-contract tests for the staleness-weighted
 * self-check pick (self-check.ts).
 *
 * Everything is deterministic: either a stub rng pinned to a fixed value or
 * `createSeededRng` with fixed seeds. No clock, no DB.
 */

import type { SeededRng } from '@/core/types';
import { createSeededRng } from '@/core/rng/seeded-rng';
import {
  pickSelfCheckNode,
  SELF_CHECK_STALENESS_CAP_MS,
  type SelfCheckCandidate,
} from '../self-check';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stub rng whose next() always returns `v` (v ∈ [0, 1)). */
function rngAt(v: number): SeededRng {
  return { next: () => v, nextInt: (min) => min };
}

/** Candidate with staleness expressed in days. */
function c(nodeId: string, days: number): SelfCheckCandidate {
  return { nodeId, staleSinceMs: days * DAY_MS };
}

describe('pickSelfCheckNode', () => {
  it('returns null for an empty candidate list (never throws)', () => {
    expect(pickSelfCheckNode([], rngAt(0))).toBeNull();
    expect(pickSelfCheckNode([], createSeededRng(1))).toBeNull();
  });

  it('returns the single candidate across the whole rng range', () => {
    const only = [c('multiplication', 3)];
    expect(pickSelfCheckNode(only, rngAt(0))).toBe('multiplication');
    expect(pickSelfCheckNode(only, rngAt(0.5))).toBe('multiplication');
    expect(pickSelfCheckNode(only, rngAt(0.999))).toBe('multiplication');
  });

  it('is deterministic for the same seed', () => {
    const candidates = [c('a', 1), c('b', 5), c('c', 12)];
    const first = pickSelfCheckNode(candidates, createSeededRng(42));
    const second = pickSelfCheckNode(candidates, createSeededRng(42));
    expect(first).toBe(second);
  });

  it('weights the draw by staleness (staler nodes claim more of the range)', () => {
    // Weights: fresh = 1d, stale = 10d → total 11d; fresh covers [0, 1/11).
    const candidates = [c('fresh', 1), c('stale', 10)];
    expect(pickSelfCheckNode(candidates, rngAt(0.05))).toBe('fresh');
    expect(pickSelfCheckNode(candidates, rngAt(0.5))).toBe('stale');
  });

  it('falls back to a uniform draw when every candidate is equally fresh (weight floor)', () => {
    const candidates = [c('a', 0), c('b', 0), c('c', 0)];
    // All weights clamp to the floor → equal thirds of the range.
    expect(pickSelfCheckNode(candidates, rngAt(0))).toBe('a');
    expect(pickSelfCheckNode(candidates, rngAt(0.5))).toBe('b');
    expect(pickSelfCheckNode(candidates, rngAt(0.99))).toBe('c');
  });

  it('clamps negative staleness (clock skew) to the floor instead of rejecting it', () => {
    const candidates = [c('skewed', -5), c('normal', 0)];
    // Both clamp to the floor → uniform halves.
    expect(pickSelfCheckNode(candidates, rngAt(0.25))).toBe('skewed');
    expect(pickSelfCheckNode(candidates, rngAt(0.75))).toBe('normal');
  });

  it('caps staleness at 30 days so one ancient node cannot monopolize the draw', () => {
    // ancient clamps 365d → 30d; old stays 29d. Total 59d; ancient covers [0, 30/59 ≈ 0.508).
    const candidates = [c('ancient', 365), c('old', 29)];
    expect(SELF_CHECK_STALENESS_CAP_MS).toBe(30 * DAY_MS);
    expect(pickSelfCheckNode(candidates, rngAt(0.4))).toBe('ancient');
    expect(pickSelfCheckNode(candidates, rngAt(0.6))).toBe('old');
  });

  it('statistically prefers the stale node across many seeds', () => {
    // fresh ≈ 0.04d ≈ 57.6min (above the 1-minute floor), stale = 20d.
    const candidates = [c('fresh', 0.04), c('stale', 20)];
    let stalePicks = 0;
    for (let seed = 0; seed < 500; seed++) {
      if (pickSelfCheckNode(candidates, createSeededRng(seed)) === 'stale') {
        stalePicks++;
      }
    }
    // Expected ≈ 500 * 20/20.04 ≈ 499 — anything above 400 proves the weighting.
    expect(stalePicks).toBeGreaterThan(400);
  });
});
