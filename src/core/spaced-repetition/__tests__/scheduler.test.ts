/**
 * Tests for src/core/spaced-repetition/scheduler.ts
 *
 * Verifies:
 * - promote advances one band, sets dueAt = nowMs + intervalsMs[band+1]
 * - promote at top band stays at top (clamp)
 * - hold keeps band, re-dues at current interval
 * - demote drops one band, increments lapses
 * - demote at band 0 stays at 0 with lapses incremented (anti-shame clamp)
 * - lapses never feeds disposition (high-lapses correct-fast still promotes)
 * - purity: same inputs → same output, nowMs injected
 * - elapsedMs <= 0 treated as fast (fast path, not slow)
 * - elapsedMs exactly equal to targetMs is treated as fast (boundary)
 */

import { scheduleReview } from '../scheduler';
import type { ReviewOutcome, ScheduledFields } from '../scheduler';
import type { SpacedRepetitionConfig } from '@/config/spaced-repetition';

// 6-band test config mirroring SR_POLICY shape.
const TEST_CONFIG: SpacedRepetitionConfig = {
  intervalsMs: [1000, 3000, 7000, 16000, 35000, 70000],
};

const NOW = 1_000_000; // arbitrary epoch ms

/** Build a ScheduledFields at a given band with optional lapses. */
function state(band: number, lapses = 0): ScheduledFields {
  return { intervalBandIndex: band, dueAt: 0, lapses };
}

/** Build a ReviewOutcome that is correct and fast. */
function correctFast(elapsedMs = 1000, targetMs = 6000): ReviewOutcome {
  return { correct: true, elapsedMs, targetMs };
}

/** Build a ReviewOutcome that is correct but slow. */
function correctSlow(elapsedMs = 8000, targetMs = 6000): ReviewOutcome {
  return { correct: true, elapsedMs, targetMs };
}

/** Build a ReviewOutcome that is incorrect. */
function incorrect(elapsedMs = 5000, targetMs = 6000): ReviewOutcome {
  return { correct: false, elapsedMs, targetMs };
}

describe('scheduleReview — promote', () => {
  it('advances band by 1 on correct+fast', () => {
    const result = scheduleReview(state(2), correctFast(), NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(3);
  });

  it('sets dueAt = nowMs + intervalsMs[newBand] on promote', () => {
    const result = scheduleReview(state(2), correctFast(), NOW, TEST_CONFIG);
    expect(result.dueAt).toBe(NOW + TEST_CONFIG.intervalsMs[3]);
  });

  it('does not increment lapses on promote', () => {
    const result = scheduleReview(state(2, 5), correctFast(), NOW, TEST_CONFIG);
    expect(result.lapses).toBe(5);
  });

  it('promote at top band stays at top (clamp)', () => {
    const top = TEST_CONFIG.intervalsMs.length - 1; // 5
    const result = scheduleReview(state(top), correctFast(), NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(top);
  });

  it('promote at top band sets dueAt using top interval', () => {
    const top = TEST_CONFIG.intervalsMs.length - 1;
    const result = scheduleReview(state(top), correctFast(), NOW, TEST_CONFIG);
    expect(result.dueAt).toBe(NOW + TEST_CONFIG.intervalsMs[top]);
  });

  it('elapsedMs exactly equal to targetMs is treated as fast (promotes)', () => {
    const outcome: ReviewOutcome = { correct: true, elapsedMs: 6000, targetMs: 6000 };
    const result = scheduleReview(state(1), outcome, NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(2); // promoted
  });

  it('elapsedMs = 0 is treated as fast (promotes)', () => {
    const outcome: ReviewOutcome = { correct: true, elapsedMs: 0, targetMs: 6000 };
    const result = scheduleReview(state(1), outcome, NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(2);
  });

  it('elapsedMs negative is treated as fast (promotes)', () => {
    const outcome: ReviewOutcome = { correct: true, elapsedMs: -100, targetMs: 6000 };
    const result = scheduleReview(state(1), outcome, NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(2);
  });
});

describe('scheduleReview — hold', () => {
  it('keeps band on correct+slow', () => {
    const result = scheduleReview(state(3), correctSlow(), NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(3);
  });

  it('sets dueAt = nowMs + intervalsMs[sameBand] on hold', () => {
    const result = scheduleReview(state(3), correctSlow(), NOW, TEST_CONFIG);
    expect(result.dueAt).toBe(NOW + TEST_CONFIG.intervalsMs[3]);
  });

  it('does not increment lapses on hold', () => {
    const result = scheduleReview(state(3, 2), correctSlow(), NOW, TEST_CONFIG);
    expect(result.lapses).toBe(2);
  });

  it('elapsedMs one above targetMs is treated as slow (holds, not promotes)', () => {
    const outcome: ReviewOutcome = { correct: true, elapsedMs: 6001, targetMs: 6000 };
    const result = scheduleReview(state(2), outcome, NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(2); // hold, not promote
  });
});

describe('scheduleReview — demote', () => {
  it('drops band by 1 on incorrect', () => {
    const result = scheduleReview(state(3), incorrect(), NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(2);
  });

  it('sets dueAt = nowMs + intervalsMs[newBand] on demote', () => {
    const result = scheduleReview(state(3), incorrect(), NOW, TEST_CONFIG);
    expect(result.dueAt).toBe(NOW + TEST_CONFIG.intervalsMs[2]);
  });

  it('increments lapses by 1 on demote', () => {
    const result = scheduleReview(state(3, 4), incorrect(), NOW, TEST_CONFIG);
    expect(result.lapses).toBe(5);
  });

  it('demote at band 0 stays at 0 (anti-shame: never negative)', () => {
    const result = scheduleReview(state(0), incorrect(), NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(0);
  });

  it('demote at band 0 still increments lapses (telemetry)', () => {
    const result = scheduleReview(state(0, 3), incorrect(), NOW, TEST_CONFIG);
    expect(result.lapses).toBe(4);
  });

  it('demote at band 0 sets dueAt using band 0 interval', () => {
    const result = scheduleReview(state(0), incorrect(), NOW, TEST_CONFIG);
    expect(result.dueAt).toBe(NOW + TEST_CONFIG.intervalsMs[0]);
  });
});

describe('scheduleReview — lapses telemetry invariant', () => {
  it('lapses never affects disposition: high-lapses correct-fast still promotes', () => {
    const highLapsesState = state(2, 999);
    const result = scheduleReview(highLapsesState, correctFast(), NOW, TEST_CONFIG);
    // Should promote regardless of lapses.
    expect(result.intervalBandIndex).toBe(3);
    // lapses unchanged on promote.
    expect(result.lapses).toBe(999);
  });

  it('lapses never affects disposition: high-lapses correct-slow still holds', () => {
    const highLapsesState = state(2, 999);
    const result = scheduleReview(highLapsesState, correctSlow(), NOW, TEST_CONFIG);
    expect(result.intervalBandIndex).toBe(2);
    expect(result.lapses).toBe(999);
  });

  it('lapses accumulates correctly across multiple demotes', () => {
    let s = state(3, 0);
    s = scheduleReview(s, incorrect(), NOW, TEST_CONFIG);
    expect(s.lapses).toBe(1);
    s = scheduleReview(s, incorrect(), NOW, TEST_CONFIG);
    expect(s.lapses).toBe(2);
    s = scheduleReview(s, correctFast(), NOW, TEST_CONFIG); // promote — lapses unchanged
    expect(s.lapses).toBe(2);
  });
});

describe('scheduleReview — purity', () => {
  it('same inputs produce the same output (deterministic)', () => {
    const s = state(2, 3);
    const outcome = correctFast(2000, 6000);
    const r1 = scheduleReview(s, outcome, NOW, TEST_CONFIG);
    const r2 = scheduleReview(s, outcome, NOW, TEST_CONFIG);
    expect(r1).toEqual(r2);
  });

  it('different nowMs produces different dueAt', () => {
    const s = state(2);
    const outcome = correctFast();
    const r1 = scheduleReview(s, outcome, 1_000_000, TEST_CONFIG);
    const r2 = scheduleReview(s, outcome, 2_000_000, TEST_CONFIG);
    expect(r2.dueAt - r1.dueAt).toBe(1_000_000);
    // Band is the same (same outcome).
    expect(r1.intervalBandIndex).toBe(r2.intervalBandIndex);
  });

  it('does not mutate the current state object', () => {
    const s = state(2, 1);
    const originalBand = s.intervalBandIndex;
    const originalLapses = s.lapses;
    scheduleReview(s, correctFast(), NOW, TEST_CONFIG);
    expect(s.intervalBandIndex).toBe(originalBand);
    expect(s.lapses).toBe(originalLapses);
  });
});

describe('scheduleReview — dueAt formula', () => {
  it('dueAt = nowMs + intervalsMs[newBand] for every disposition', () => {
    const configs = [
      { s: state(1), outcome: correctFast(), expectedBand: 2 },   // promote
      { s: state(1), outcome: correctSlow(), expectedBand: 1 },   // hold
      { s: state(1), outcome: incorrect(),   expectedBand: 0 },   // demote
    ];

    for (const { s, outcome, expectedBand } of configs) {
      const result = scheduleReview(s, outcome, NOW, TEST_CONFIG);
      expect(result.dueAt).toBe(NOW + TEST_CONFIG.intervalsMs[expectedBand]);
      expect(result.intervalBandIndex).toBe(expectedBand);
    }
  });
});
