/**
 * Tests for src/core/spaced-repetition/scheduler-metrics.ts
 *
 * Verifies:
 * - seedSpacedRepetition() returns { intervalBandIndex: 0, lapses: 0 }
 * - parseSpacedRepetition round-trips correctly
 * - parseSpacedRepetition preserves co-resident `mastery` key (other-carry-through)
 * - parseSpacedRepetition preserves arbitrary other keys
 * - malformed/empty JSON degrades to seed (safe degradation, never throws)
 * - serializeSpacedRepetition merges slice into other keys
 * - toReviewItem projects a due row correctly
 */

import {
  seedSpacedRepetition,
  parseSpacedRepetition,
  serializeSpacedRepetition,
  toReviewItem,
} from '../scheduler-metrics';
import type { SpacedRepetitionSlice, ReviewItem } from '../scheduler-metrics';
import type { ProgressRow } from '@/db/types';

// ---------------------------------------------------------------------------
// seedSpacedRepetition
// ---------------------------------------------------------------------------

describe('seedSpacedRepetition', () => {
  it('returns intervalBandIndex: 0', () => {
    expect(seedSpacedRepetition().intervalBandIndex).toBe(0);
  });

  it('returns lapses: 0', () => {
    expect(seedSpacedRepetition().lapses).toBe(0);
  });

  it('returns a fresh object on each call (not the same reference)', () => {
    const a = seedSpacedRepetition();
    const b = seedSpacedRepetition();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// parseSpacedRepetition — basic extraction
// ---------------------------------------------------------------------------

describe('parseSpacedRepetition — basic extraction', () => {
  it('parses a valid spacedRepetition sub-key', () => {
    const json = JSON.stringify({ spacedRepetition: { intervalBandIndex: 3, lapses: 2 } });
    const { spacedRepetition } = parseSpacedRepetition(json);
    expect(spacedRepetition.intervalBandIndex).toBe(3);
    expect(spacedRepetition.lapses).toBe(2);
  });

  it('seeds when spacedRepetition key is absent', () => {
    const json = JSON.stringify({ mastery: { slices: {}, aggregate: 0.5 } });
    const { spacedRepetition } = parseSpacedRepetition(json);
    expect(spacedRepetition.intervalBandIndex).toBe(0);
    expect(spacedRepetition.lapses).toBe(0);
  });

  it('seeds on empty string input', () => {
    const { spacedRepetition, other } = parseSpacedRepetition('');
    expect(spacedRepetition).toEqual(seedSpacedRepetition());
    expect(other).toEqual({});
  });

  it('seeds on malformed JSON (never throws)', () => {
    const { spacedRepetition } = parseSpacedRepetition('{invalid json}');
    expect(spacedRepetition).toEqual(seedSpacedRepetition());
  });

  it('seeds when JSON is an array (not an object)', () => {
    const { spacedRepetition } = parseSpacedRepetition('[]');
    expect(spacedRepetition).toEqual(seedSpacedRepetition());
  });

  it('seeds when JSON is a string (not an object)', () => {
    const { spacedRepetition } = parseSpacedRepetition('"hello"');
    expect(spacedRepetition).toEqual(seedSpacedRepetition());
  });

  it('seeds when spacedRepetition value is not an object', () => {
    const json = JSON.stringify({ spacedRepetition: 'bad' });
    const { spacedRepetition } = parseSpacedRepetition(json);
    expect(spacedRepetition).toEqual(seedSpacedRepetition());
  });

  it('coerces missing intervalBandIndex to 0', () => {
    const json = JSON.stringify({ spacedRepetition: { lapses: 5 } });
    const { spacedRepetition } = parseSpacedRepetition(json);
    expect(spacedRepetition.intervalBandIndex).toBe(0);
    expect(spacedRepetition.lapses).toBe(5);
  });

  it('coerces missing lapses to 0', () => {
    const json = JSON.stringify({ spacedRepetition: { intervalBandIndex: 2 } });
    const { spacedRepetition } = parseSpacedRepetition(json);
    expect(spacedRepetition.intervalBandIndex).toBe(2);
    expect(spacedRepetition.lapses).toBe(0);
  });

  it('coerces NaN intervalBandIndex to 0', () => {
    // JSON.stringify(NaN) -> 'null'; simulate via string replacement for testing the parser.
    const json = '{"spacedRepetition":{"intervalBandIndex":null,"lapses":1}}';
    const { spacedRepetition } = parseSpacedRepetition(json);
    expect(spacedRepetition.intervalBandIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseSpacedRepetition — OTHER-KEY CARRY-THROUGH (the critical invariant)
// ---------------------------------------------------------------------------

describe('parseSpacedRepetition — other-key carry-through', () => {
  it('preserves co-resident mastery key in `other`', () => {
    const masteryValue = { slices: { abstract: { window: [0.5], scalar: 0.5 } }, aggregate: 0.5 };
    const json = JSON.stringify({
      mastery: masteryValue,
      spacedRepetition: { intervalBandIndex: 2, lapses: 1 },
    });
    const { spacedRepetition, other } = parseSpacedRepetition(json);
    expect(spacedRepetition.intervalBandIndex).toBe(2);
    expect(other.mastery).toEqual(masteryValue);
  });

  it('excludes spacedRepetition from `other`', () => {
    const json = JSON.stringify({ spacedRepetition: { intervalBandIndex: 1, lapses: 0 }, foo: 'bar' });
    const { other } = parseSpacedRepetition(json);
    expect(other).not.toHaveProperty('spacedRepetition');
    expect(other.foo).toBe('bar');
  });

  it('preserves arbitrary extra keys in `other`', () => {
    const json = JSON.stringify({
      spacedRepetition: { intervalBandIndex: 1, lapses: 0 },
      customKey: 42,
      anotherKey: { nested: true },
    });
    const { other } = parseSpacedRepetition(json);
    expect(other.customKey).toBe(42);
    expect(other.anotherKey).toEqual({ nested: true });
  });

  it('other is empty {} when JSON has only spacedRepetition', () => {
    const json = JSON.stringify({ spacedRepetition: { intervalBandIndex: 3, lapses: 0 } });
    const { other } = parseSpacedRepetition(json);
    expect(other).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// serializeSpacedRepetition
// ---------------------------------------------------------------------------

describe('serializeSpacedRepetition', () => {
  it('produces a JSON string with spacedRepetition sub-key', () => {
    const slice: SpacedRepetitionSlice = { intervalBandIndex: 2, lapses: 3 };
    const result = serializeSpacedRepetition({}, slice);
    const parsed = JSON.parse(result);
    expect(parsed.spacedRepetition).toEqual({ intervalBandIndex: 2, lapses: 3 });
  });

  it('merges spacedRepetition with existing other keys (preserves mastery)', () => {
    const masteryValue = { aggregate: 0.7, slices: {} };
    const other = { mastery: masteryValue };
    const slice: SpacedRepetitionSlice = { intervalBandIndex: 4, lapses: 0 };
    const result = serializeSpacedRepetition(other, slice);
    const parsed = JSON.parse(result);
    expect(parsed.mastery).toEqual(masteryValue);
    expect(parsed.spacedRepetition.intervalBandIndex).toBe(4);
  });

  it('does not mutate the other object', () => {
    const other = { mastery: { aggregate: 0.3 } };
    const slice: SpacedRepetitionSlice = { intervalBandIndex: 1, lapses: 0 };
    const originalKeys = Object.keys(other);
    serializeSpacedRepetition(other, slice);
    expect(Object.keys(other)).toEqual(originalKeys);
    expect(other).not.toHaveProperty('spacedRepetition');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: parse → serialize → parse
// ---------------------------------------------------------------------------

describe('parse → serialize → parse round-trip', () => {
  it('round-trips spacedRepetition correctly', () => {
    const slice: SpacedRepetitionSlice = { intervalBandIndex: 4, lapses: 7 };
    const json1 = serializeSpacedRepetition({}, slice);
    const { spacedRepetition: sliceBack } = parseSpacedRepetition(json1);
    expect(sliceBack).toEqual(slice);
  });

  it('round-trip preserves co-resident mastery key end-to-end', () => {
    // Simulate a blob that already has mastery from stage 04.
    const masteryValue = { slices: { abstract: { window: [0.8], scalar: 0.8 } }, aggregate: 0.8 };
    const initialJson = JSON.stringify({ mastery: masteryValue });

    // Parse it (spacedRepetition absent → seeds).
    const { spacedRepetition, other } = parseSpacedRepetition(initialJson);
    expect(spacedRepetition).toEqual(seedSpacedRepetition());
    expect(other.mastery).toEqual(masteryValue);

    // Simulate a schedule update.
    const updatedSlice: SpacedRepetitionSlice = { intervalBandIndex: 2, lapses: 1 };

    // Serialize back — MUST pass other so mastery survives.
    const serialized = serializeSpacedRepetition(other, updatedSlice);
    const reparsed = JSON.parse(serialized);

    // mastery must be intact.
    expect(reparsed.mastery).toEqual(masteryValue);
    // spacedRepetition must reflect the update.
    expect(reparsed.spacedRepetition).toEqual({ intervalBandIndex: 2, lapses: 1 });
  });
});

// ---------------------------------------------------------------------------
// toReviewItem
// ---------------------------------------------------------------------------

describe('toReviewItem', () => {
  function makeRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
    return {
      nodeId: 'test-node',
      masteryLevel: 1,
      streak: 0,
      xp: 0,
      dueAt: 1_000_000,
      metrics: JSON.stringify({ spacedRepetition: { intervalBandIndex: 3, lapses: 1 } }),
      updatedAt: 0,
      ...overrides,
    };
  }

  it('projects nodeId, dueAt, and intervalBandIndex from a row', () => {
    const row = makeRow({ nodeId: 'fraction-simplification', dueAt: 5_000_000 });
    const item: ReviewItem = toReviewItem(row);
    expect(item.nodeId).toBe('fraction-simplification');
    expect(item.dueAt).toBe(5_000_000);
    expect(item.intervalBandIndex).toBe(3);
  });

  it('uses 0 as fallback dueAt when row.dueAt is null', () => {
    const row = makeRow({ dueAt: null });
    const item = toReviewItem(row);
    expect(item.dueAt).toBe(0);
  });

  it('returns intervalBandIndex 0 when metrics has no spacedRepetition key', () => {
    const row = makeRow({
      metrics: JSON.stringify({ mastery: { aggregate: 0.9 } }),
    });
    const item = toReviewItem(row);
    expect(item.intervalBandIndex).toBe(0);
  });

  it('returns intervalBandIndex 0 when metrics is empty string', () => {
    const row = makeRow({ metrics: '' });
    const item = toReviewItem(row);
    expect(item.intervalBandIndex).toBe(0);
  });

  it('does not expose lapses in ReviewItem (telemetry-only, not projected)', () => {
    const row = makeRow();
    const item = toReviewItem(row);
    expect(item).not.toHaveProperty('lapses');
  });
});
