/**
 * Tests for src/config/spaced-repetition.ts
 *
 * Verifies:
 * - SR_POLICY has 6 bands
 * - Band values match [1,3,7,16,35,70] * DAY_MS (86_400_000)
 * - SR_POLICY is frozen (Object.isFrozen)
 * - resolveSpacedRepetitionConfig() with no arg returns SR_POLICY
 * - resolveSpacedRepetitionConfig() with a partial override merges correctly
 */

import { SR_POLICY, resolveSpacedRepetitionConfig } from '../spaced-repetition';

const DAY_MS = 24 * 60 * 60 * 1_000; // 86_400_000

describe('SR_POLICY', () => {
  it('has exactly 6 bands', () => {
    expect(SR_POLICY.intervalsMs).toHaveLength(6);
  });

  it('materializes band values from [1,3,7,16,35,70] days to ms', () => {
    const expectedDays = [1, 3, 7, 16, 35, 70];
    const expectedMs = expectedDays.map((d) => d * DAY_MS);
    expect(Array.from(SR_POLICY.intervalsMs)).toEqual(expectedMs);
  });

  it('band 0 is 1 day in ms', () => {
    expect(SR_POLICY.intervalsMs[0]).toBe(1 * DAY_MS);
  });

  it('band 5 (top) is 70 days in ms', () => {
    expect(SR_POLICY.intervalsMs[5]).toBe(70 * DAY_MS);
  });

  it('is frozen at the top level', () => {
    expect(Object.isFrozen(SR_POLICY)).toBe(true);
  });

  it('intervalsMs array is frozen', () => {
    expect(Object.isFrozen(SR_POLICY.intervalsMs)).toBe(true);
  });
});

describe('resolveSpacedRepetitionConfig', () => {
  it('returns SR_POLICY when called with no argument', () => {
    const result = resolveSpacedRepetitionConfig();
    expect(result).toBe(SR_POLICY);
  });

  it('returns SR_POLICY when called with undefined', () => {
    const result = resolveSpacedRepetitionConfig(undefined);
    expect(result).toBe(SR_POLICY);
  });

  it('returns a frozen config with the override when an override is provided', () => {
    const customIntervals = [100, 200, 300];
    const result = resolveSpacedRepetitionConfig({ intervalsMs: customIntervals });
    expect(Array.from(result.intervalsMs)).toEqual(customIntervals);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('falls back to SR_POLICY.intervalsMs when override has no intervalsMs', () => {
    // Empty override object — all fields fall back to SR_POLICY.
    const result = resolveSpacedRepetitionConfig({});
    expect(Array.from(result.intervalsMs)).toEqual(Array.from(SR_POLICY.intervalsMs));
  });

  it('does not mutate SR_POLICY when returning a merged config', () => {
    const original = Array.from(SR_POLICY.intervalsMs);
    resolveSpacedRepetitionConfig({ intervalsMs: [999, 9999] });
    expect(Array.from(SR_POLICY.intervalsMs)).toEqual(original);
  });
});
