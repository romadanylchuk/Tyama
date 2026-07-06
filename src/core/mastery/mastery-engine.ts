/**
 * mastery-engine.ts — Pure mastery scalar engine (Phase 2, Stage 04).
 *
 * Computes the graded per-(node, representationLevel) mastery scalar from
 * a rolling window of raw per-attempt scalars.
 *
 * FORMULA (D1 — locked, do not relitigate):
 *   rawAttemptScalar = accuracy * speedFactor(elapsedMs, targetMs, speedFloor)
 *                    * levelCeiling(representationLevel, config)
 *
 *   sliceScalar = combineWindow(window)      // windowed mean of raws
 *   aggregate   = max(slice scalars)          // across present levels
 *
 * ANTI-SHAME INVARIANT (structural, asserted by tests):
 *   - speedFactor is floor-bounded at `speedFloor` (default 0.7). It NEVER
 *     returns 0, never evicts, never blocks. Slower-than-target → bounded at
 *     speedFloor; faster-than-target → capped at 1.0 (full credit, no bonus).
 *   - A correct-but-slow attempt always contributes rawAttemptScalar ≥
 *     1 * speedFloor * levelCeiling > 0. Speed is an UP-FORCE only.
 *   - A correct attempt always contributes rawAttemptScalar ≤ levelCeiling
 *     (the CPA ceiling is a hard cap: concrete ≤ 0.45, pictorial ≤ 0.75,
 *     abstract ≤ 1.0). aggregate ∈ [0, 1] always.
 *   - An error (accuracy 0) records a 0 raw into the window — rolling accuracy
 *     eases the slice scalar down, but NOTHING is subtracted from milestones,
 *     mastery_level, streak, or XP. The window is a rolling measurement, not
 *     a punishment ledger. Window eviction is strictly size-bounded (FIFO oldest
 *     out) — never penalty-based.
 *
 * CONFIG-AS-DATA INVARIANT:
 *   All constants (speedFloor, targetMs, windowSize, levelCeilings) come from
 *   the resolved `MasteryConfig` arg. NEVER hardcode pedagogy values here.
 *   `pedagogy-pass` calibrates them later as data.
 *
 * PURITY:
 *   All exports are pure functions (no DB, no clock, no I/O, no localized strings).
 *   `pushAttempt` returns a NEW `MasteryMetrics` — input is never mutated.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 */

import type { RepresentationLevel } from '@/core/types';
import type { MasteryConfig } from '@/core/mastery/mastery-config';
import type { MasteryMetrics, MasterySlice } from '@/core/mastery/mastery-metrics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum multiplier for a faster-than-target attempt.
 *
 * At-or-faster-than-target earns full credit (1.0 × levelCeiling) — no
 * superhuman bonus. This is `clamp01(targetMs / elapsedMs)` semantics per D1:
 * `speedFactor ∈ [speedFloor, 1.0]`, so `rawAttemptScalar ≤ levelCeiling`
 * and `aggregate ≤ 1.0` always. Speed is an UP-FORCE only (floor-bounded
 * below at `speedFloor`; never 0). Being fast earns full credit; being even
 * faster adds nothing extra.
 *
 * This is the CPA ceiling guarantee: a concrete-only learner (ceiling 0.45)
 * can never push aggregate above 0.45, which is structurally below the 0.80
 * mastery gate — the gate-crossing requires abstract-level mastery.
 */
const SPEED_FACTOR_MAX = 1.0;

// ---------------------------------------------------------------------------
// speedFactor — floor-bounded up-force (ANTI-SHAME core)
// ---------------------------------------------------------------------------

/**
 * speedFactor(elapsedMs, targetMs, speedFloor): number
 *
 * Computes the speed multiplier for an attempt.
 *
 * ANTI-SHAME INVARIANT: the return value is ALWAYS ≥ speedFloor > 0.
 * A correct-but-slow attempt never zeroes the raw; speed is an up-force only.
 *
 *   - elapsedMs ≤ targetMs (fast): speedFactor = clamp(targetMs/elapsedMs, speedFloor, SPEED_FACTOR_MAX)
 *     → 1.0 (at-or-faster-than-target earns full credit, no superhuman bonus)
 *   - elapsedMs > targetMs (slow): speedFactor = clamp(targetMs/elapsedMs, speedFloor, SPEED_FACTOR_MAX)
 *     → between speedFloor and 1.0
 *
 * Edge cases:
 *   - elapsedMs ≤ 0: treated as instantaneous → SPEED_FACTOR_MAX = 1.0 (no division by zero).
 *   - targetMs ≤ 0: degenerate config → returns 1.0 (neutral; no penalty).
 *   - Both ≤ 0: returns 1.0.
 *
 * @param elapsedMs  - Wall time the learner spent on the attempt (ms).
 * @param targetMs   - Per-atom target time from resolved MasteryConfig (ms).
 * @param speedFloor - Lower bound on speedFactor (> 0). From MasteryConfig.speedFloor.
 * @returns          - Speed multiplier ∈ [speedFloor, 1.0].
 */
export function speedFactor(elapsedMs: number, targetMs: number, speedFloor: number): number {
  // Degenerate config guard: targetMs ≤ 0 → neutral factor
  if (targetMs <= 0) {
    return 1.0;
  }
  // Degenerate input guard: elapsedMs ≤ 0 → instantaneous → maximum factor
  if (elapsedMs <= 0) {
    return SPEED_FACTOR_MAX;
  }

  const raw = targetMs / elapsedMs;
  // Clamp to [speedFloor, SPEED_FACTOR_MAX]. speedFloor MUST be > 0 (contract).
  return Math.min(SPEED_FACTOR_MAX, Math.max(speedFloor, raw));
}

// ---------------------------------------------------------------------------
// levelCeiling — CPA trajectory ceiling from config
// ---------------------------------------------------------------------------

/**
 * levelCeiling(level, config): number
 *
 * Returns the scalar ceiling for the given representation level.
 * Reads from `config.levelCeilings[level]` — never hardcoded.
 *
 * CPA trajectory (shipped defaults):
 *   concrete  → 0.45 (foundational; high concrete automaticity ≠ abstract mastery)
 *   pictorial → 0.75 (bridge; pictorial bridges toward abstract)
 *   abstract  → 1.00 (full scale; abstract automaticity is the mastery goal)
 *
 * @param level  - The CPA representation level of the attempt.
 * @param config - Resolved MasteryConfig (per-node override over defaults).
 * @returns      - The ceiling ∈ (0, 1] for this level.
 */
export function levelCeiling(level: RepresentationLevel, config: MasteryConfig): number {
  return config.levelCeilings[level];
}

// ---------------------------------------------------------------------------
// rawAttemptScalar — per-attempt contribution
// ---------------------------------------------------------------------------

/**
 * rawAttemptScalar(accuracy, elapsedMs, level, config): number
 *
 * Computes the raw scalar contribution of a single attempt.
 *
 * FORMULA (D1):
 *   raw = accuracy * speedFactor(elapsedMs, config.targetMs, config.speedFloor)
 *              * levelCeiling(level, config)
 *
 * - `accuracy` ∈ {0, 1} per attempt (1 = correct, 0 = failed-step).
 * - A correct-but-slow attempt: accuracy=1, speedFactor=speedFloor=0.7, ceiling=1.0
 *   → raw = 1 * 0.7 * 1.0 = 0.7. Never 0. Speed is an up-force.
 * - An incorrect attempt: accuracy=0, raw=0 (regardless of speed — failed-step
 *   is a routing signal, not a speed event).
 *
 * @param accuracy   - 1 for correct, 0 for failed-step.
 * @param elapsedMs  - Wall time for the attempt (ms).
 * @param level      - CPA representation level.
 * @param config     - Resolved MasteryConfig.
 * @returns          - Raw scalar ∈ [0, levelCeiling(level, config)].
 */
export function rawAttemptScalar(
  accuracy: 0 | 1,
  elapsedMs: number,
  level: RepresentationLevel,
  config: MasteryConfig
): number {
  if (accuracy === 0) {
    // Incorrect attempt: 0 raw. (Speed is irrelevant — the accuracy term zeroes it.)
    return 0;
  }
  const ceiling = levelCeiling(level, config);
  const raw = speedFactor(elapsedMs, config.targetMs, config.speedFloor) * ceiling;
  // Belt-and-suspenders: hard-cap at the level ceiling so future formula changes
  // cannot silently push the raw above its CPA ceiling. Since SPEED_FACTOR_MAX ≤ 1.0
  // this clamp is a no-op under current config but remains a structural guarantee.
  return Math.min(ceiling, raw);
}

// ---------------------------------------------------------------------------
// combineWindow — windowed mean
// ---------------------------------------------------------------------------

/**
 * combineWindow(window): number
 *
 * Computes the windowed mean of an array of raw scalars.
 * Returns 0 for an empty window (first-touch / no attempts yet).
 *
 * The mean is the combination strategy chosen for the scalar: it gives equal
 * weight to all entries in the rolling window, so recent correct attempts
 * steadily raise the slice scalar while recent incorrect attempts ease it down —
 * a natural rolling-accuracy signal, not a ledger.
 *
 * @param window - Array of raw per-attempt scalars (oldest-first, newest-last).
 * @returns      - Mean of entries, or 0 for empty array.
 */
export function combineWindow(window: readonly number[]): number {
  if (window.length === 0) {
    return 0;
  }
  const sum = window.reduce((acc, v) => acc + v, 0);
  return sum / window.length;
}

// ---------------------------------------------------------------------------
// pushAttempt — rolling window push + recompute (main engine entry)
// ---------------------------------------------------------------------------

/**
 * pushAttempt(metrics, level, raw, config): MasteryMetrics
 *
 * Pushes a new raw scalar onto the (node, level) slice's rolling window,
 * evicts the oldest entry if the window exceeds `config.windowSize`, recomputes
 * the slice scalar, and recomputes `aggregate = max(present slice scalars)`.
 *
 * PURE — returns a NEW MasteryMetrics; the input `metrics` is never mutated.
 *
 * FIFO eviction: oldest entry (index 0) is dropped when the window length
 * would exceed `config.windowSize`. This is a size-bounded rolling measurement,
 * NOT a punishment/eviction policy. The newest entry is always at the tail.
 *
 * ANTI-SHAME: a correct-but-slow attempt with raw > 0 always contributes to
 * the window and never triggers eviction of itself. Error attempts (raw = 0)
 * are recorded into the window as 0 — they ease the slice scalar down via the
 * rolling mean, but they do not trigger any special eviction, blocking, or
 * demotion.
 *
 * aggregate = max(present slice scalars): a learner who reached abstract is
 * NEVER dragged down by early concrete practice. Tested explicitly.
 *
 * CEILING CLAMP: after computing the windowed mean, the final slice scalar is
 * hard-clamped to `levelCeiling(level, config)`. This kills any floating-point
 * summation drift (e.g. mean([0.45, 0.45, ...]) = 0.4500000000000001) and
 * makes `sliceScalar ≤ ceiling` exact — so `aggregate ≤ 1.0` always holds
 * structurally. A concrete-only learner's aggregate is guaranteed ≤ 0.45,
 * which is structurally below the 0.80 mastery gate. Speed is still an
 * UP-FORCE only (floor-bounded at speedFloor); this clamp only affects the
 * upper bound.
 *
 * @param metrics - Current MasteryMetrics for this node (immutable input).
 * @param level   - The representation level of this attempt.
 * @param raw     - The rawAttemptScalar for this attempt (≥ 0).
 * @param config  - Resolved MasteryConfig (provides windowSize).
 * @returns       - New MasteryMetrics with updated slice + aggregate.
 */
export function pushAttempt(
  metrics: MasteryMetrics,
  level: RepresentationLevel,
  raw: number,
  config: MasteryConfig
): MasteryMetrics {
  const existing = metrics.slices[level];
  const priorWindow: readonly number[] = existing?.window ?? [];

  // Build new window: push raw onto tail, evict oldest from head if over limit.
  const extended = [...priorWindow, raw];
  const newWindow =
    extended.length > config.windowSize
      ? extended.slice(extended.length - config.windowSize) // keep newest N
      : extended;

  // Hard-clamp the windowed mean to the level ceiling to eliminate any
  // floating-point summation drift (e.g. mean of twelve 0.45 raws can yield
  // 0.4500000000000001 — one ULP above the ceiling). This is the structural
  // guarantee that sliceScalar ≤ levelCeiling(level, config) EXACTLY.
  const newScalar = Math.min(combineWindow(newWindow), levelCeiling(level, config));

  const newSlice: MasterySlice = {
    window: newWindow,
    scalar: newScalar,
  };

  // Merge the updated slice into a new slices map (other levels are preserved).
  const newSlices: Partial<Record<RepresentationLevel, MasterySlice>> = {
    ...metrics.slices,
    [level]: newSlice,
  };

  // aggregate = max across ALL present slice scalars.
  const allLevels: RepresentationLevel[] = ['concrete', 'pictorial', 'abstract'];
  let aggregate = 0;
  for (const l of allLevels) {
    const slice = newSlices[l];
    if (slice !== undefined && slice.scalar > aggregate) {
      aggregate = slice.scalar;
    }
  }

  return {
    slices: newSlices,
    aggregate,
  };
}

// ---------------------------------------------------------------------------
// aggregateOf — read the aggregate from a MasteryMetrics value
// ---------------------------------------------------------------------------

/**
 * aggregateOf(metrics): number
 *
 * Returns the aggregate mastery coordinate (0..1) from a `MasteryMetrics` value.
 *
 * This is the coordinate read by stage-02 `selectBand`, scaffolding-fade
 * cut-points, and stage-06 gamification rings — the single mastery coordinate.
 *
 * @param metrics - The current MasteryMetrics for a node.
 * @returns       - The aggregate scalar ∈ [0, 1].
 */
export function aggregateOf(metrics: MasteryMetrics): number {
  return metrics.aggregate;
}
