/**
 * ring-state.test.ts — Pure ring-state derivation tests (Stage 06, Phase 4).
 *
 * Covers the Phase 4 completion criterion:
 *   - `fill` is provably the raw aggregate in every state.
 *   - `coming-soon` availability → `not-yet-open` regardless of aggregate.
 *   - A scalar drop below `masteryThreshold` → `in-progress`, NOT a loss state.
 *   - Untouched (aggregate 0, available) → `available`, never empty/red.
 *   - No `'locked'` value exists in the `RingState` union (vocabulary guard).
 */

import { deriveRingState, type RingState } from '../ring-state';

const CONFIG = { masteryThreshold: 0.8 };

describe('deriveRingState', () => {
  it('fill is always the raw aggregate scalar, in every state', () => {
    expect(deriveRingState(0, 'available', CONFIG).fill).toBe(0);
    expect(deriveRingState(0.35, 'available', CONFIG).fill).toBe(0.35);
    expect(deriveRingState(0.8, 'available', CONFIG).fill).toBe(0.8);
    expect(deriveRingState(0.5, 'coming-soon', CONFIG).fill).toBe(0.5);
  });

  it('coming-soon availability → not-yet-open regardless of aggregate', () => {
    expect(deriveRingState(0, 'coming-soon', CONFIG).state).toBe('not-yet-open');
    expect(deriveRingState(0.5, 'coming-soon', CONFIG).state).toBe('not-yet-open');
    expect(deriveRingState(1.0, 'coming-soon', CONFIG).state).toBe('not-yet-open');
  });

  it('untouched node (aggregate 0, available) → available, never an empty/red state', () => {
    const result = deriveRingState(0, 'available', CONFIG);
    expect(result.state).toBe('available');
    expect(result.fill).toBe(0);
  });

  it('aggregate above masteryThreshold, available → mastered', () => {
    expect(deriveRingState(0.8, 'available', CONFIG).state).toBe('mastered');
    expect(deriveRingState(0.95, 'available', CONFIG).state).toBe('mastered');
  });

  it('aggregate between 0 and masteryThreshold, available → in-progress', () => {
    expect(deriveRingState(0.1, 'available', CONFIG).state).toBe('in-progress');
    expect(deriveRingState(0.79, 'available', CONFIG).state).toBe('in-progress');
  });

  it('a windowed scalar decrease below masteryThreshold returns in-progress, NOT a loss state', () => {
    // Simulates a node that was mastered (0.85) and then eased down (0.6):
    // there is no separate "regressed"/"lost mastery" state in the union —
    // it is structurally identical to ordinary in-progress.
    const wasMastered = deriveRingState(0.85, 'available', CONFIG);
    const easedDown = deriveRingState(0.6, 'available', CONFIG);

    expect(wasMastered.state).toBe('mastered');
    expect(easedDown.state).toBe('in-progress');
    expect(easedDown.fill).toBe(0.6);
  });

  it('the RingState union never contains "locked" (anti-shame vocabulary guard)', () => {
    const allStates: RingState[] = ['not-yet-open', 'available', 'in-progress', 'mastered'];
    expect(allStates).not.toContain('locked');
    // Every derivable outcome across representative inputs must be one of
    // the four sanctioned values.
    const sanctioned = new Set<RingState>(allStates);
    for (const availability of ['available', 'coming-soon'] as const) {
      for (const aggregate of [0, 0.1, 0.4, 0.79, 0.8, 0.81, 1.0]) {
        const { state } = deriveRingState(aggregate, availability, CONFIG);
        expect(sanctioned.has(state)).toBe(true);
      }
    }
  });

  it('respects a per-node masteryThreshold override (config-as-data)', () => {
    const looseConfig = { masteryThreshold: 0.5 };
    expect(deriveRingState(0.5, 'available', looseConfig).state).toBe('mastered');
    expect(deriveRingState(0.5, 'available', CONFIG).state).toBe('in-progress');
  });
});

// ---------------------------------------------------------------------------
// Evidence floor (minMasteryAttempts) — the learner-facing mastery gate
// ---------------------------------------------------------------------------

describe('deriveRingState — minMasteryAttempts evidence floor', () => {
  const FLOOR_CONFIG = { masteryThreshold: 0.8, minMasteryAttempts: 6 };

  it('withholds mastered (as plain in-progress) when evidence is short of the floor', () => {
    const { state } = deriveRingState(0.95, 'available', FLOOR_CONFIG, 2);
    expect(state).toBe('in-progress'); // never a loss/denied state
  });

  it('grants mastered once the evidence floor is met', () => {
    expect(deriveRingState(0.95, 'available', FLOOR_CONFIG, 6).state).toBe('mastered');
    expect(deriveRingState(0.95, 'available', FLOOR_CONFIG, 12).state).toBe('mastered');
  });

  it('legacy callers (no attempts arg) keep threshold-only behavior', () => {
    expect(deriveRingState(0.95, 'available', FLOOR_CONFIG).state).toBe('mastered');
  });

  it('config without minMasteryAttempts keeps threshold-only behavior even with attempts', () => {
    expect(deriveRingState(0.95, 'available', { masteryThreshold: 0.8 }, 1).state).toBe('mastered');
  });

  it('fill remains the raw aggregate while the floor withholds mastered', () => {
    const { fill } = deriveRingState(0.9, 'available', FLOOR_CONFIG, 1);
    expect(fill).toBe(0.9);
  });
});
