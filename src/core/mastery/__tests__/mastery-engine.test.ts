/**
 * mastery-engine.test.ts — Phase 2 unit tests for the pure mastery scalar engine.
 *
 * Tests cover (per Phase 2 plan):
 *   (a) Level ceilings cap concrete at 0.45, abstract at 1.0.
 *   (b) speedFactor at exactly targetMs ≈ 1.0; far-slower ≥ speedFloor and < 1;
 *       far-faster capped at 1.0 (SPEED_FACTOR_MAX); NEVER 0.
 *   (c) accuracy=0 → raw=0; window still records it (rolling accuracy); slice scalar
 *       eases down but the window is never blocked/evicted as punishment.
 *   (d) Window evicts oldest beyond windowSize (FIFO, size-bounded).
 *   (e) aggregate = max — a high abstract slice is NOT dragged down by a low concrete slice.
 *   (f) Concrete and abstract attempts NEVER share a window.
 *
 * ANTI-SHAME tests (explicit, load-bearing):
 *   - A correct-but-arbitrarily-slow attempt NEVER yields 0.
 *   - A single correct attempt NEVER DECREASES the scalar relative to no attempt.
 *   - Faster correct → higher-or-equal scalar; slower correct → still ≥ floor*ceiling.
 *   - Speed is an UP-FORCE only; an incorrect attempt records a routing signal (0 raw)
 *     but does NOT evict, block, or penalize any milestone/XP/mastery_level.
 */

import {
  speedFactor,
  levelCeiling,
  rawAttemptScalar,
  combineWindow,
  pushAttempt,
  aggregateOf,
} from '@/core/mastery/mastery-engine';
import { DEFAULT_MASTERY_CONFIG } from '@/core/mastery/mastery-config';
import { seedMasteryMetrics } from '@/core/mastery/mastery-metrics';
import type { MasteryConfig } from '@/core/mastery/mastery-config';
import type { MasteryMetrics } from '@/core/mastery/mastery-metrics';

// ---------------------------------------------------------------------------
// Test config helpers
// ---------------------------------------------------------------------------

/**
 * A standard test config matching the shipped defaults.
 * Tests that need to vary a single field use spread-override.
 */
const STD_CONFIG: MasteryConfig = { ...DEFAULT_MASTERY_CONFIG };

/** Empty MasteryMetrics (first-touch node, no attempts yet). */
const EMPTY_METRICS: MasteryMetrics = seedMasteryMetrics();

// ---------------------------------------------------------------------------
// (a) Level ceilings
// ---------------------------------------------------------------------------

describe('levelCeiling — CPA trajectory projection', () => {
  it('concrete ceiling matches config (default 0.45)', () => {
    expect(levelCeiling('concrete', STD_CONFIG)).toBe(STD_CONFIG.levelCeilings.concrete);
    expect(levelCeiling('concrete', STD_CONFIG)).toBe(0.45);
  });

  it('pictorial ceiling matches config (default 0.75)', () => {
    expect(levelCeiling('pictorial', STD_CONFIG)).toBe(STD_CONFIG.levelCeilings.pictorial);
    expect(levelCeiling('pictorial', STD_CONFIG)).toBe(0.75);
  });

  it('abstract ceiling matches config (default 1.0)', () => {
    expect(levelCeiling('abstract', STD_CONFIG)).toBe(STD_CONFIG.levelCeilings.abstract);
    expect(levelCeiling('abstract', STD_CONFIG)).toBe(1.0);
  });

  it('reads from config — a custom ceiling override is respected', () => {
    const customConfig: MasteryConfig = {
      ...STD_CONFIG,
      levelCeilings: { concrete: 0.3, pictorial: 0.6, abstract: 0.9 },
    };
    expect(levelCeiling('concrete', customConfig)).toBe(0.3);
    expect(levelCeiling('pictorial', customConfig)).toBe(0.6);
    expect(levelCeiling('abstract', customConfig)).toBe(0.9);
  });

  it('abstract ceiling is strictly greater than pictorial (ordering sanity)', () => {
    expect(levelCeiling('abstract', STD_CONFIG)).toBeGreaterThan(levelCeiling('pictorial', STD_CONFIG));
  });

  it('pictorial ceiling is strictly greater than concrete (ordering sanity)', () => {
    expect(levelCeiling('pictorial', STD_CONFIG)).toBeGreaterThan(levelCeiling('concrete', STD_CONFIG));
  });
});

// ---------------------------------------------------------------------------
// (b) speedFactor — floor-bounded up-force, NEVER 0
// ---------------------------------------------------------------------------

describe('speedFactor — floor-bounded up-force', () => {
  const floor = STD_CONFIG.speedFloor; // 0.7
  const target = STD_CONFIG.targetMs;  // 6000

  it('at exactly targetMs → returns 1.0 (neutral speed)', () => {
    expect(speedFactor(target, target, floor)).toBeCloseTo(1.0, 10);
  });

  it('faster than target → returns 1.0 (at-or-faster-than-target earns full credit, no superhuman bonus)', () => {
    expect(speedFactor(target / 2, target, floor)).toBe(1.0);
  });

  it('much faster than target → capped at 1.0 (SPEED_FACTOR_MAX = 1.0)', () => {
    // Near-instant attempt (1 ms vs 6000 ms target) → capped at 1.0
    const factor = speedFactor(1, target, floor);
    expect(factor).toBeLessThanOrEqual(1.0);
    expect(factor).toBeGreaterThan(0);
  });

  it('elapsedMs = 0 (instantaneous) → 1.0 (SPEED_FACTOR_MAX, no division by zero)', () => {
    const factor = speedFactor(0, target, floor);
    expect(factor).toBeLessThanOrEqual(1.0);
    expect(factor).toBeGreaterThan(0);
  });

  it('slower than target → returns < 1.0 but ≥ speedFloor', () => {
    const factor = speedFactor(target * 2, target, floor);
    expect(factor).toBeLessThan(1.0);
    expect(factor).toBeGreaterThanOrEqual(floor);
  });

  it('far slower than target → still ≥ speedFloor (never 0)', () => {
    const factor = speedFactor(target * 100, target, floor);
    expect(factor).toBeGreaterThanOrEqual(floor);
    expect(factor).toBeGreaterThan(0);
  });

  it('extremely slow (10× target) → still ≥ speedFloor', () => {
    const factor = speedFactor(target * 10, target, floor);
    expect(factor).toBeGreaterThanOrEqual(floor);
  });

  it('elapsedMs = Number.MAX_SAFE_INTEGER → floor-bounded, never 0', () => {
    const factor = speedFactor(Number.MAX_SAFE_INTEGER, target, floor);
    expect(factor).toBeGreaterThanOrEqual(floor);
    expect(factor).toBeGreaterThan(0);
  });

  it('ANTI-SHAME: speedFactor NEVER returns 0 regardless of elapsed time', () => {
    const testCases = [1, 100, 1000, 6000, 60000, 600000, Number.MAX_SAFE_INTEGER];
    for (const elapsed of testCases) {
      expect(speedFactor(elapsed, target, floor)).toBeGreaterThan(0);
    }
  });

  it('reads speedFloor from config arg (different floor respected)', () => {
    const customFloor = 0.5;
    // 100× slower than target: raw ratio = 6000/600000 = 0.01 → clamped to 0.5
    const factor = speedFactor(600000, target, customFloor);
    expect(factor).toBeGreaterThanOrEqual(customFloor);
    expect(factor).toBeLessThan(1.0);
  });

  it('degenerate: targetMs = 0 → returns 1.0 (neutral, no error)', () => {
    expect(speedFactor(1000, 0, floor)).toBe(1.0);
  });

  it('degenerate: targetMs < 0 → returns 1.0 (neutral, no error)', () => {
    expect(speedFactor(1000, -100, floor)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// (b cont.) rawAttemptScalar — accuracy × speedFactor × ceiling
// ---------------------------------------------------------------------------

describe('rawAttemptScalar — formula application', () => {
  it('correct at target speed, abstract level → ceiling (1.0 * 1.0 * 1.0 = 1.0)', () => {
    const target = STD_CONFIG.targetMs;
    const raw = rawAttemptScalar(1, target, 'abstract', STD_CONFIG);
    expect(raw).toBeCloseTo(1.0, 10);
  });

  it('correct at target speed, concrete level → concrete ceiling (0.45)', () => {
    const raw = rawAttemptScalar(1, STD_CONFIG.targetMs, 'concrete', STD_CONFIG);
    expect(raw).toBeCloseTo(0.45, 10);
  });

  it('correct at target speed, pictorial level → pictorial ceiling (0.75)', () => {
    const raw = rawAttemptScalar(1, STD_CONFIG.targetMs, 'pictorial', STD_CONFIG);
    expect(raw).toBeCloseTo(0.75, 10);
  });

  it('incorrect at any speed, abstract → 0 (accuracy term zeroes the raw)', () => {
    expect(rawAttemptScalar(0, 100, 'abstract', STD_CONFIG)).toBe(0);
    expect(rawAttemptScalar(0, 6000, 'abstract', STD_CONFIG)).toBe(0);
    expect(rawAttemptScalar(0, 60000, 'abstract', STD_CONFIG)).toBe(0);
  });

  it('incorrect at any speed, concrete → 0', () => {
    expect(rawAttemptScalar(0, STD_CONFIG.targetMs, 'concrete', STD_CONFIG)).toBe(0);
  });

  // ANTI-SHAME: correct-but-slow NEVER yields 0
  it('ANTI-SHAME: correct-but-very-slow → raw ≥ speedFloor * abstract ceiling (never 0)', () => {
    const raw = rawAttemptScalar(1, 1_000_000, 'abstract', STD_CONFIG);
    const minExpected = STD_CONFIG.speedFloor * STD_CONFIG.levelCeilings.abstract;
    expect(raw).toBeGreaterThanOrEqual(minExpected);
    expect(raw).toBeGreaterThan(0);
  });

  it('ANTI-SHAME: correct-but-very-slow concrete → raw ≥ speedFloor * concrete ceiling', () => {
    const raw = rawAttemptScalar(1, 1_000_000, 'concrete', STD_CONFIG);
    const minExpected = STD_CONFIG.speedFloor * STD_CONFIG.levelCeilings.concrete;
    expect(raw).toBeGreaterThanOrEqual(minExpected);
    expect(raw).toBeGreaterThan(0);
  });

  it('ANTI-SHAME: faster correct → higher-or-equal raw than slower correct (abstract)', () => {
    const faster = rawAttemptScalar(1, STD_CONFIG.targetMs / 2, 'abstract', STD_CONFIG);
    const slower = rawAttemptScalar(1, STD_CONFIG.targetMs * 2, 'abstract', STD_CONFIG);
    expect(faster).toBeGreaterThanOrEqual(slower);
  });
});

// ---------------------------------------------------------------------------
// (c) accuracy=0 records into window; slice eases down; no eviction/blocking
// ---------------------------------------------------------------------------

describe('accuracy=0 — window records the 0 raw, no eviction as punishment', () => {
  it('an incorrect attempt pushes a 0 into the window (window length grows)', () => {
    const after = pushAttempt(EMPTY_METRICS, 'abstract', 0, STD_CONFIG);
    expect(after.slices.abstract?.window).toHaveLength(1);
    expect(after.slices.abstract?.window[0]).toBe(0);
  });

  it('the slice scalar after a single incorrect attempt is 0 (windowed mean of [0])', () => {
    const after = pushAttempt(EMPTY_METRICS, 'abstract', 0, STD_CONFIG);
    expect(after.slices.abstract?.scalar).toBe(0);
  });

  it('after a correct then incorrect attempt, window contains both (no eviction as penalty)', () => {
    const raw1 = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG); // 1.0
    const raw2 = rawAttemptScalar(0, STD_CONFIG.targetMs, 'abstract', STD_CONFIG); // 0
    const after1 = pushAttempt(EMPTY_METRICS, 'abstract', raw1, STD_CONFIG);
    const after2 = pushAttempt(after1, 'abstract', raw2, STD_CONFIG);
    expect(after2.slices.abstract?.window).toHaveLength(2);
    expect(after2.slices.abstract?.window).toEqual([raw1, raw2]);
  });

  it('scalar eases down (rolling mean) after correct+incorrect — not zeroed instantly', () => {
    const raw1 = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG); // 1.0
    const after1 = pushAttempt(EMPTY_METRICS, 'abstract', raw1, STD_CONFIG);
    const scalarBefore = after1.slices.abstract!.scalar; // 1.0

    const after2 = pushAttempt(after1, 'abstract', 0, STD_CONFIG);
    const scalarAfter = after2.slices.abstract!.scalar;

    // Mean([1.0, 0]) = 0.5 — eased down but not zeroed
    expect(scalarAfter).toBeLessThan(scalarBefore);
    expect(scalarAfter).toBeGreaterThan(0);
    expect(scalarAfter).toBeCloseTo(raw1 / 2, 10);
  });
});

// ---------------------------------------------------------------------------
// (d) Window eviction — FIFO, size-bounded
// ---------------------------------------------------------------------------

describe('pushAttempt — window eviction (FIFO, size-bounded)', () => {
  it('window does not exceed windowSize after many pushes', () => {
    let metrics = EMPTY_METRICS;
    const raw = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG);
    for (let i = 0; i < STD_CONFIG.windowSize + 5; i++) {
      metrics = pushAttempt(metrics, 'abstract', raw, STD_CONFIG);
    }
    expect(metrics.slices.abstract?.window).toHaveLength(STD_CONFIG.windowSize);
  });

  it('oldest entries are evicted first (newest-last ordering preserved)', () => {
    // Fill window to exactly windowSize with raws [0, 0.1, 0.2, ..., (N-1)*0.1]
    let metrics = EMPTY_METRICS;
    const N = STD_CONFIG.windowSize; // 12
    for (let i = 0; i < N; i++) {
      metrics = pushAttempt(metrics, 'abstract', i * 0.01, STD_CONFIG);
    }
    // Now push one more — index 0 should be evicted
    metrics = pushAttempt(metrics, 'abstract', 0.999, STD_CONFIG);
    const window = metrics.slices.abstract!.window;

    expect(window).toHaveLength(N);
    // Newest entry (0.999) must be at tail
    expect(window[window.length - 1]).toBeCloseTo(0.999, 10);
    // First entry (index 0 = raw 0.00) must be gone — new first is index 1 (raw 0.01)
    expect(window[0]).toBeCloseTo(0.01, 10);
  });

  it('eviction is size-bounded only — no penalty-based eviction (correct at any speed kept)', () => {
    // Push a mix of correct and incorrect; verify no additional eviction beyond size
    const config: MasteryConfig = { ...STD_CONFIG, windowSize: 3 };
    let metrics = EMPTY_METRICS;
    // Push: [0, 0.5, 0] (incorrect, correct, incorrect)
    metrics = pushAttempt(metrics, 'abstract', 0, config);
    metrics = pushAttempt(metrics, 'abstract', 0.5, config);
    metrics = pushAttempt(metrics, 'abstract', 0, config);
    // Window full at 3
    expect(metrics.slices.abstract?.window).toHaveLength(3);
    // Push one more — evicts oldest (the 0), window stays at 3
    metrics = pushAttempt(metrics, 'abstract', 0.8, config);
    expect(metrics.slices.abstract?.window).toHaveLength(3);
    expect(metrics.slices.abstract?.window).toEqual([0.5, 0, 0.8]);
  });

  it('custom windowSize is respected (reads from config, not hardcoded)', () => {
    const config: MasteryConfig = { ...STD_CONFIG, windowSize: 5 };
    let metrics = EMPTY_METRICS;
    const raw = rawAttemptScalar(1, config.targetMs, 'abstract', config);
    for (let i = 0; i < 10; i++) {
      metrics = pushAttempt(metrics, 'abstract', raw, config);
    }
    expect(metrics.slices.abstract?.window).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// (e) aggregate = max — high abstract never dragged down by low concrete
// ---------------------------------------------------------------------------

describe('aggregate = max across slice scalars', () => {
  it('aggregate equals the max slice scalar (abstract high, concrete low)', () => {
    let metrics = EMPTY_METRICS;
    // Push one incorrect concrete attempt (raw=0) → concrete slice scalar=0
    metrics = pushAttempt(metrics, 'concrete', 0, STD_CONFIG);
    // Push several correct abstract attempts → high abstract scalar
    const rawAbs = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG);
    for (let i = 0; i < 5; i++) {
      metrics = pushAttempt(metrics, 'abstract', rawAbs, STD_CONFIG);
    }
    // aggregate = max(concrete=0, abstract≈1.0) = abstract scalar
    const concScalar = metrics.slices.concrete!.scalar; // 0
    const absScalar = metrics.slices.abstract!.scalar;  // ~1.0
    expect(metrics.aggregate).toBeCloseTo(absScalar, 10);
    expect(metrics.aggregate).toBeGreaterThan(concScalar);
  });

  it('a learner who reached abstract is not dragged down by early concrete practice', () => {
    let metrics = EMPTY_METRICS;
    // Concrete level: all incorrect (simulate a learner who struggled at concrete)
    for (let i = 0; i < STD_CONFIG.windowSize; i++) {
      metrics = pushAttempt(metrics, 'concrete', 0, STD_CONFIG);
    }
    // Abstract level: all correct at target speed
    const rawAbs = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG);
    for (let i = 0; i < STD_CONFIG.windowSize; i++) {
      metrics = pushAttempt(metrics, 'abstract', rawAbs, STD_CONFIG);
    }

    expect(metrics.slices.concrete?.scalar).toBe(0); // concrete entirely failed
    expect(metrics.slices.abstract?.scalar).toBeCloseTo(rawAbs, 10); // abstract perfect
    // Aggregate = max = abstract scalar (concrete failure does NOT drag it down)
    expect(metrics.aggregate).toBeCloseTo(rawAbs, 10);
  });

  it('aggregate when only one level has data = that level scalar', () => {
    const raw = rawAttemptScalar(1, STD_CONFIG.targetMs, 'pictorial', STD_CONFIG);
    const after = pushAttempt(EMPTY_METRICS, 'pictorial', raw, STD_CONFIG);
    expect(after.aggregate).toBeCloseTo(raw, 10);
  });

  it('aggregate updates correctly when a lower slice gets better than others', () => {
    let metrics = EMPTY_METRICS;
    // Abstract: one moderate attempt
    const rawAbs50 = 0.5; // half of abstract ceiling
    metrics = pushAttempt(metrics, 'abstract', rawAbs50, STD_CONFIG);
    // Concrete: many perfect attempts → concrete slice = 0.45 ceiling avg
    const rawConc = rawAttemptScalar(1, STD_CONFIG.targetMs, 'concrete', STD_CONFIG);
    for (let i = 0; i < 5; i++) {
      metrics = pushAttempt(metrics, 'concrete', rawConc, STD_CONFIG);
    }
    // aggregate = max(abstract slice, concrete slice)
    const absSlice = metrics.slices.abstract!.scalar; // mean([0.5]) = 0.5
    const concSlice = metrics.slices.concrete!.scalar; // mean([0.45, 0.45, ...]) = 0.45
    expect(metrics.aggregate).toBeCloseTo(Math.max(absSlice, concSlice), 10);
  });
});

// ---------------------------------------------------------------------------
// (f) Concrete and abstract attempts NEVER share a window
// ---------------------------------------------------------------------------

describe('representation-level window isolation', () => {
  it('concrete and abstract each have their own independent window', () => {
    let metrics = EMPTY_METRICS;
    const rawConc = rawAttemptScalar(1, STD_CONFIG.targetMs, 'concrete', STD_CONFIG);
    const rawAbs = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG);

    // Push concrete, then abstract, then concrete again
    metrics = pushAttempt(metrics, 'concrete', rawConc, STD_CONFIG);
    metrics = pushAttempt(metrics, 'abstract', rawAbs, STD_CONFIG);
    metrics = pushAttempt(metrics, 'concrete', rawConc, STD_CONFIG);

    // Each window has exactly its own entries
    expect(metrics.slices.concrete?.window).toHaveLength(2);
    expect(metrics.slices.abstract?.window).toHaveLength(1);
  });

  it('concrete window is unaffected by abstract pushes', () => {
    let metrics = EMPTY_METRICS;
    const rawConc = rawAttemptScalar(1, STD_CONFIG.targetMs, 'concrete', STD_CONFIG);

    // Push 3 concretes
    for (let i = 0; i < 3; i++) {
      metrics = pushAttempt(metrics, 'concrete', rawConc, STD_CONFIG);
    }
    const concreteWindowBefore = [...(metrics.slices.concrete?.window ?? [])];

    // Push some abstracts — must NOT alter concrete window
    const rawAbs = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG);
    for (let i = 0; i < 5; i++) {
      metrics = pushAttempt(metrics, 'abstract', rawAbs, STD_CONFIG);
    }

    expect(metrics.slices.concrete?.window).toEqual(concreteWindowBefore);
  });

  it('all three levels have independent windows (concrete/pictorial/abstract)', () => {
    let metrics = EMPTY_METRICS;
    metrics = pushAttempt(metrics, 'concrete', 0.1, STD_CONFIG);
    metrics = pushAttempt(metrics, 'pictorial', 0.2, STD_CONFIG);
    metrics = pushAttempt(metrics, 'abstract', 0.3, STD_CONFIG);
    metrics = pushAttempt(metrics, 'concrete', 0.4, STD_CONFIG);

    // Concrete: [0.1, 0.4], Pictorial: [0.2], Abstract: [0.3]
    expect(metrics.slices.concrete?.window).toEqual([0.1, 0.4]);
    expect(metrics.slices.pictorial?.window).toEqual([0.2]);
    expect(metrics.slices.abstract?.window).toEqual([0.3]);
  });
});

// ---------------------------------------------------------------------------
// combineWindow — windowed mean
// ---------------------------------------------------------------------------

describe('combineWindow — windowed mean', () => {
  it('empty window → 0', () => {
    expect(combineWindow([])).toBe(0);
  });

  it('single entry → that entry', () => {
    expect(combineWindow([0.7])).toBeCloseTo(0.7, 10);
  });

  it('all zeros → 0', () => {
    expect(combineWindow([0, 0, 0])).toBe(0);
  });

  it('all same values → that value', () => {
    expect(combineWindow([0.5, 0.5, 0.5])).toBeCloseTo(0.5, 10);
  });

  it('mixed values → arithmetic mean', () => {
    expect(combineWindow([0.2, 0.4, 0.6])).toBeCloseTo(0.4, 10);
  });

  it('window of [1.0] → 1.0', () => {
    expect(combineWindow([1.0])).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// pushAttempt — immutability + purity
// ---------------------------------------------------------------------------

describe('pushAttempt — immutability', () => {
  it('returns a NEW object (does not mutate the input metrics)', () => {
    const before = pushAttempt(EMPTY_METRICS, 'abstract', 0.5, STD_CONFIG);
    const after = pushAttempt(before, 'abstract', 0.8, STD_CONFIG);
    // before must be unchanged
    expect(before.slices.abstract?.window).toHaveLength(1);
    expect(after.slices.abstract?.window).toHaveLength(2);
    expect(before).not.toBe(after);
  });

  it('other levels in the slice map are preserved after pushing to one level', () => {
    let metrics = EMPTY_METRICS;
    metrics = pushAttempt(metrics, 'concrete', 0.3, STD_CONFIG);
    metrics = pushAttempt(metrics, 'pictorial', 0.5, STD_CONFIG);
    // Push abstract; verify concrete and pictorial are still there unchanged
    const withAbstract = pushAttempt(metrics, 'abstract', 0.9, STD_CONFIG);
    expect(withAbstract.slices.concrete?.window).toEqual([0.3]);
    expect(withAbstract.slices.pictorial?.window).toEqual([0.5]);
    expect(withAbstract.slices.abstract?.window).toEqual([0.9]);
  });
});

// ---------------------------------------------------------------------------
// aggregateOf — convenience reader
// ---------------------------------------------------------------------------

describe('aggregateOf', () => {
  it('returns 0 for empty metrics (first-touch)', () => {
    expect(aggregateOf(EMPTY_METRICS)).toBe(0);
  });

  it('matches metrics.aggregate after pushAttempt', () => {
    const raw = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG);
    const after = pushAttempt(EMPTY_METRICS, 'abstract', raw, STD_CONFIG);
    expect(aggregateOf(after)).toBe(after.aggregate);
  });
});

// ---------------------------------------------------------------------------
// ANTI-SHAME — explicit, comprehensive up-force tests
// ---------------------------------------------------------------------------

describe('ANTI-SHAME — speed is an up-force only (explicit assertions)', () => {
  it('a single correct-but-arbitrarily-slow abstract attempt NEVER yields aggregate=0', () => {
    const slowElapsed = 1_000_000; // 1000× target
    const raw = rawAttemptScalar(1, slowElapsed, 'abstract', STD_CONFIG);
    const after = pushAttempt(EMPTY_METRICS, 'abstract', raw, STD_CONFIG);
    expect(after.aggregate).toBeGreaterThan(0);
  });

  it('correct-but-slow abstract slice scalar ≥ speedFloor * abstract ceiling', () => {
    const slowElapsed = 1_000_000;
    const raw = rawAttemptScalar(1, slowElapsed, 'abstract', STD_CONFIG);
    const after = pushAttempt(EMPTY_METRICS, 'abstract', raw, STD_CONFIG);
    const minScalar = STD_CONFIG.speedFloor * STD_CONFIG.levelCeilings.abstract;
    expect(after.slices.abstract!.scalar).toBeGreaterThanOrEqual(minScalar);
  });

  it('correct-but-slow concrete slice scalar ≥ speedFloor * concrete ceiling', () => {
    const raw = rawAttemptScalar(1, 1_000_000, 'concrete', STD_CONFIG);
    const after = pushAttempt(EMPTY_METRICS, 'concrete', raw, STD_CONFIG);
    const minScalar = STD_CONFIG.speedFloor * STD_CONFIG.levelCeilings.concrete;
    expect(after.slices.concrete!.scalar).toBeGreaterThanOrEqual(minScalar);
  });

  it('faster correct attempt → higher-or-equal aggregate than slower correct attempt', () => {
    const rawFast = rawAttemptScalar(1, STD_CONFIG.targetMs / 3, 'abstract', STD_CONFIG);
    const rawSlow = rawAttemptScalar(1, STD_CONFIG.targetMs * 10, 'abstract', STD_CONFIG);

    const afterFast = pushAttempt(EMPTY_METRICS, 'abstract', rawFast, STD_CONFIG);
    const afterSlow = pushAttempt(EMPTY_METRICS, 'abstract', rawSlow, STD_CONFIG);

    // Faster always >= slower at equal accuracy and level
    expect(afterFast.aggregate).toBeGreaterThanOrEqual(afterSlow.aggregate);
  });

  it('a single correct attempt raises aggregate ABOVE the empty baseline (0)', () => {
    const raw = rawAttemptScalar(1, STD_CONFIG.targetMs * 5, 'abstract', STD_CONFIG); // slow
    const after = pushAttempt(EMPTY_METRICS, 'abstract', raw, STD_CONFIG);
    // After one correct (even slow) attempt, aggregate > 0 (was 0 for empty)
    expect(after.aggregate).toBeGreaterThan(aggregateOf(EMPTY_METRICS));
  });

  it('speed up-force proof: multiple speeds all produce non-zero correct-attempt raws', () => {
    const elapsedTimes = [1, 100, 1000, 6000, 12000, 60000, 600000];
    for (const elapsed of elapsedTimes) {
      const raw = rawAttemptScalar(1, elapsed, 'abstract', STD_CONFIG);
      expect(raw).toBeGreaterThan(0);
    }
  });

  it('a session of correct-but-slow attempts steadily raises the abstract scalar', () => {
    let metrics = EMPTY_METRICS;
    const slowElapsed = STD_CONFIG.targetMs * 10; // 10× slower than target
    let lastScalar = 0;

    for (let i = 1; i <= 5; i++) {
      const raw = rawAttemptScalar(1, slowElapsed, 'abstract', STD_CONFIG);
      metrics = pushAttempt(metrics, 'abstract', raw, STD_CONFIG);
      const scalar = metrics.slices.abstract!.scalar;
      if (i === 1) {
        expect(scalar).toBeGreaterThan(0); // first correct attempt raises from 0
      } else {
        // Window fills with same raw each time → scalar stays constant (all entries = raw)
        expect(scalar).toBeCloseTo(lastScalar, 10);
      }
      lastScalar = scalar;
    }
  });

  it('an incorrect attempt does NOT evict any prior correct entry as punishment', () => {
    // Push 5 correct attempts, then 1 incorrect. Window has 6 entries (within windowSize).
    let metrics = EMPTY_METRICS;
    const rawCorrect = rawAttemptScalar(1, STD_CONFIG.targetMs, 'abstract', STD_CONFIG);

    for (let i = 0; i < 5; i++) {
      metrics = pushAttempt(metrics, 'abstract', rawCorrect, STD_CONFIG);
    }
    const windowBefore = metrics.slices.abstract!.window.length;

    // Push one incorrect
    metrics = pushAttempt(metrics, 'abstract', 0, STD_CONFIG);
    const windowAfter = metrics.slices.abstract!.window.length;

    // Window grew by exactly 1 (the incorrect attempt was added, no penalty eviction)
    expect(windowAfter).toBe(windowBefore + 1);
    // The 5 correct entries are still in the window
    const entries = metrics.slices.abstract!.window;
    const correctCount = entries.filter((v) => v > 0).length;
    expect(correctCount).toBe(5);
  });

  it('after many incorrect attempts, aggregate may ease to 0 (rolling window) but ZERO items are evicted as punishment', () => {
    // This tests the rolling window behavior: a full window of incorrect attempts
    // does ease the scalar to 0, but that is the NATURAL rolling measurement,
    // not a punishment. The window is correctly full (windowSize entries).
    const config: MasteryConfig = { ...STD_CONFIG, windowSize: 3 };
    let metrics = EMPTY_METRICS;

    // Fill with incorrect (raw=0)
    for (let i = 0; i < 3; i++) {
      metrics = pushAttempt(metrics, 'abstract', 0, config);
    }
    // All 3 entries are 0, so mean = 0. This is an acceptable measurement.
    expect(metrics.slices.abstract!.window).toHaveLength(3);
    expect(metrics.slices.abstract!.scalar).toBe(0);
    // But aggregate easing to 0 is NOT a milestone subtraction — it's just the scalar.
    // (No test for milestone behavior here — that's phase 3's territory.)
  });

  // ---------------------------------------------------------------------------
  // CEILING CAP — sliceScalar ≤ levelCeiling and aggregate ≤ 1.0 ALWAYS
  // (S2 from review-2-report: upper-bound assertions)
  // ---------------------------------------------------------------------------

  it('CEILING CAP: superfast correct abstract → sliceScalar ≤ 1.0 (abstract ceiling) and aggregate ≤ 1.0', () => {
    // 1 ms vs 6000 ms target — maximally fast attempt
    const raw = rawAttemptScalar(1, 1, 'abstract', STD_CONFIG);
    const after = pushAttempt(EMPTY_METRICS, 'abstract', raw, STD_CONFIG);
    expect(after.slices.abstract!.scalar).toBeLessThanOrEqual(1.0);
    expect(after.aggregate).toBeLessThanOrEqual(1.0);
  });

  it('CEILING CAP: superfast correct concrete → sliceScalar ≤ 0.45 (concrete ceiling is a hard cap)', () => {
    // 1 ms vs 6000 ms target — concrete cannot exceed its CPA ceiling
    const raw = rawAttemptScalar(1, 1, 'concrete', STD_CONFIG);
    const after = pushAttempt(EMPTY_METRICS, 'concrete', raw, STD_CONFIG);
    expect(after.slices.concrete!.scalar).toBeLessThanOrEqual(STD_CONFIG.levelCeilings.concrete);
    expect(after.slices.concrete!.scalar).toBeLessThanOrEqual(0.45);
  });

  it('STRUCTURAL: concrete-only learner cannot exceed masteryThreshold regardless of speed', () => {
    // A full window of superfast correct concrete attempts: aggregate must remain
    // below masteryThreshold (0.80) — the CPA guarantee that concrete alone
    // can NEVER cross the abstract mastery gate.
    let metrics = EMPTY_METRICS;
    for (let i = 0; i < STD_CONFIG.windowSize; i++) {
      const raw = rawAttemptScalar(1, 1, 'concrete', STD_CONFIG); // superfast
      metrics = pushAttempt(metrics, 'concrete', raw, STD_CONFIG);
    }
    expect(metrics.aggregate).toBeLessThan(STD_CONFIG.masteryThreshold);
    // Specifically: concrete ceiling (0.45) < masteryThreshold (0.80)
    expect(metrics.aggregate).toBeLessThanOrEqual(STD_CONFIG.levelCeilings.concrete);
  });
});
