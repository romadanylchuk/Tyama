/**
 * Unit tests for selectBand() and validateBands().
 *
 * Contract verified here:
 *   - Half-open interval ladder: band i covers [bands[i].minCoordinate, bands[i+1].minCoordinate).
 *   - Exact minCoordinate hit lands in the upper band (not below).
 *   - Coordinate below floor (below bands[0].minCoordinate, even negative) → lowest band.
 *   - Coordinate above top → highest band.
 *   - Single-band ladder: always returns that band.
 *   - Empty bands array throws SelectBandError.
 *   - validateBands: non-empty, bands[0].minCoordinate === 0, strictly ascending.
 */

import { selectBand, validateBands, SelectBandError } from '../select-band';
import type { Band } from '@/core/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a Band with the given minCoordinate. The `representationLevel` and
 * `params` fields are placeholders for these structural tests.
 */
function makeBand(minCoordinate: number, label: string = 'band'): Band {
  return {
    minCoordinate,
    representationLevel: 'abstract',
    params: { label },
  };
}

/** Standard 3-band fixture: [0, 0.4, 0.75]. */
const THREE_BANDS: Band[] = [
  makeBand(0, 'easy'),
  makeBand(0.4, 'medium'),
  makeBand(0.75, 'hard'),
];

// ---------------------------------------------------------------------------
// selectBand — basic ladder navigation
// ---------------------------------------------------------------------------

describe('selectBand — ladder navigation', () => {
  it('coordinate 0.0 → lowest band (bands[0])', () => {
    const result = selectBand(0.0, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('easy');
  });

  it('coordinate 0.2 → lowest band (0.0..0.4)', () => {
    const result = selectBand(0.2, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('easy');
  });

  it('coordinate 0.5 → middle band (0.4..0.75)', () => {
    const result = selectBand(0.5, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('medium');
  });

  it('coordinate 0.8 → top band (0.75..1.0)', () => {
    const result = selectBand(0.8, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('hard');
  });

  it('coordinate 1.0 → top band', () => {
    const result = selectBand(1.0, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('hard');
  });
});

// ---------------------------------------------------------------------------
// selectBand — exact minCoordinate boundary cases (half-open interval)
// ---------------------------------------------------------------------------

describe('selectBand — exact boundary hits (half-open interval)', () => {
  it('exact 0.4 hits minCoordinate of middle band → middle band', () => {
    // Half-open: [0.4, 0.75) — the value 0.4 belongs to the medium band.
    const result = selectBand(0.4, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('medium');
  });

  it('exact 0.75 hits minCoordinate of top band → top band', () => {
    // Half-open: [0.75, ∞) — the value 0.75 belongs to the hard band.
    const result = selectBand(0.75, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('hard');
  });

  it('value just below 0.4 (0.399) → lowest band', () => {
    const result = selectBand(0.399, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('easy');
  });

  it('value just below 0.75 (0.749) → middle band', () => {
    const result = selectBand(0.749, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('medium');
  });

  it('two-band ladder: exact minCoordinate of upper band → upper band', () => {
    const bands: Band[] = [makeBand(0, 'low'), makeBand(0.5, 'high')];
    // Exactly at the boundary of the upper band.
    const result = selectBand(0.5, bands);
    expect((result.params as { label: string }).label).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// selectBand — below-floor clamping (never throws on out-of-range)
// ---------------------------------------------------------------------------

describe('selectBand — coordinate below floor → lowest band', () => {
  it('coordinate -0.1 → lowest band (below floor, no throw)', () => {
    const result = selectBand(-0.1, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('easy');
  });

  it('coordinate -1000 → lowest band (far below floor, no throw)', () => {
    const result = selectBand(-1000, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('easy');
  });

  it('coordinate -Infinity → lowest band (extreme, no throw)', () => {
    const result = selectBand(-Infinity, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('easy');
  });
});

// ---------------------------------------------------------------------------
// selectBand — above-ceiling clamping
// ---------------------------------------------------------------------------

describe('selectBand — coordinate above 1.0 → top band', () => {
  it('coordinate 1.5 → top band (clamped to 1.0, no throw)', () => {
    const result = selectBand(1.5, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('hard');
  });

  it('coordinate 100 → top band (far above ceiling, no throw)', () => {
    const result = selectBand(100, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('hard');
  });

  it('coordinate Infinity → top band (extreme, no throw)', () => {
    const result = selectBand(Infinity, THREE_BANDS);
    expect((result.params as { label: string }).label).toBe('hard');
  });
});

// ---------------------------------------------------------------------------
// selectBand — single-band array (always returns that band)
// ---------------------------------------------------------------------------

describe('selectBand — single-band array', () => {
  it('coordinate 0.0 → the only band', () => {
    const bands: Band[] = [makeBand(0, 'only')];
    expect((selectBand(0.0, bands).params as { label: string }).label).toBe('only');
  });

  it('coordinate 0.5 → the only band', () => {
    const bands: Band[] = [makeBand(0, 'only')];
    expect((selectBand(0.5, bands).params as { label: string }).label).toBe('only');
  });

  it('coordinate 1.0 → the only band', () => {
    const bands: Band[] = [makeBand(0, 'only')];
    expect((selectBand(1.0, bands).params as { label: string }).label).toBe('only');
  });

  it('coordinate -0.5 → the only band (below-floor, no throw)', () => {
    const bands: Band[] = [makeBand(0, 'only')];
    expect((selectBand(-0.5, bands).params as { label: string }).label).toBe('only');
  });

  it('coordinate 2.0 → the only band (above ceiling, no throw)', () => {
    const bands: Band[] = [makeBand(0, 'only')];
    expect((selectBand(2.0, bands).params as { label: string }).label).toBe('only');
  });
});

// ---------------------------------------------------------------------------
// selectBand — empty array throws SelectBandError
// ---------------------------------------------------------------------------

describe('selectBand — empty array is a programmer error', () => {
  it('throws SelectBandError on empty bands array', () => {
    expect(() => selectBand(0.5, [])).toThrow(SelectBandError);
  });

  it('error message mentions programmer error', () => {
    expect(() => selectBand(0.5, [])).toThrow(/programmer error/i);
  });
});

// ---------------------------------------------------------------------------
// selectBand — returns the exact Band object (reference identity)
// ---------------------------------------------------------------------------

describe('selectBand — returns the exact Band object from the array', () => {
  it('returns the exact object (reference equality), not a copy', () => {
    const band0 = makeBand(0, 'easy');
    const band1 = makeBand(0.5, 'hard');
    const bands = [band0, band1];

    expect(selectBand(0.2, bands)).toBe(band0);
    expect(selectBand(0.5, bands)).toBe(band1);
    expect(selectBand(0.8, bands)).toBe(band1);
  });
});

// ---------------------------------------------------------------------------
// validateBands — non-empty, floor=0, strictly ascending
// ---------------------------------------------------------------------------

describe('validateBands — valid band ladders produce no violations', () => {
  it('THREE_BANDS fixture is valid (no violations)', () => {
    const violations = validateBands(THREE_BANDS);
    expect(violations).toEqual([]);
  });

  it('single band starting at 0 is valid', () => {
    const bands: Band[] = [makeBand(0)];
    expect(validateBands(bands)).toEqual([]);
  });

  it('two bands [0, 0.5] is valid', () => {
    const bands: Band[] = [makeBand(0), makeBand(0.5)];
    expect(validateBands(bands)).toEqual([]);
  });

  it('five bands strictly ascending from 0 is valid', () => {
    const bands: Band[] = [0, 0.2, 0.4, 0.6, 0.8].map((v) => makeBand(v));
    expect(validateBands(bands)).toEqual([]);
  });
});

describe('validateBands — violations detected', () => {
  it('empty array: one violation', () => {
    const violations = validateBands([]);
    expect(violations.length).toBe(1);
    expect(violations[0]).toMatch(/empty/i);
  });

  it('bands[0].minCoordinate !== 0: violation reported', () => {
    const bands: Band[] = [makeBand(0.1), makeBand(0.5)];
    const violations = validateBands(bands);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/bands\[0\]\.minCoordinate/);
  });

  it('non-ascending pair: violation reported', () => {
    const bands: Band[] = [makeBand(0), makeBand(0.5), makeBand(0.3)]; // 0.3 < 0.5
    const violations = validateBands(bands);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/strictly greater/i);
  });

  it('equal adjacent minCoordinate values: violation reported (must be strict)', () => {
    const bands: Band[] = [makeBand(0), makeBand(0.5), makeBand(0.5)]; // duplicate
    const violations = validateBands(bands);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('multiple violations are all reported', () => {
    // bands[0].minCoordinate ≠ 0 AND bands are not ascending.
    const bands: Band[] = [makeBand(0.1), makeBand(0.05)];
    const violations = validateBands(bands);
    expect(violations.length).toBe(2);
  });
});
