/**
 * curated-path.test.ts — validateCuratedPath guard tests (Stage 06, Phase 5).
 *
 * Covers the Phase 5 completion criterion:
 *   - `validateCuratedPath(GRAPH_FIXTURE, CURATED_ENTRY_PATH)` is `[]`.
 *   - a path referencing an absent node → violation.
 *   - a path proposing a `coming-soon` node → violation.
 */

import { CURATED_ENTRY_PATH, validateCuratedPath } from '../curated-path';
import { GRAPH_FIXTURE } from '@/core/graph/graph-fixture';

describe('validateCuratedPath', () => {
  it('the shipped default curated path has zero violations against the fixture graph', () => {
    expect(validateCuratedPath(GRAPH_FIXTURE, CURATED_ENTRY_PATH)).toEqual([]);
  });

  it('defaults to CURATED_ENTRY_PATH when no path argument is given', () => {
    expect(validateCuratedPath(GRAPH_FIXTURE)).toEqual([]);
  });

  it('flags a path node absent from the graph', () => {
    const violations = validateCuratedPath(GRAPH_FIXTURE, ['not-a-real-node']);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/absent from the graph/);
  });

  it('flags a path node that is coming-soon (not-yet-open, no registered generator)', () => {
    // addition-within-20 has no registered generator in the fixture registry.
    const violations = validateCuratedPath(GRAPH_FIXTURE, ['addition-within-20']);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/unreachable\/not-yet-open/);
  });

  it('flags a path that places a node before its own in-path prerequisite', () => {
    // fraction-simplification's prerequisite (fruit-equations) is placed AFTER it.
    const violations = validateCuratedPath(GRAPH_FIXTURE, [
      'fraction-simplification',
      'fruit-equations',
    ]);
    expect(
      violations.some((v) => v.includes('fraction-simplification') && v.includes('fruit-equations'))
    ).toBe(true);
  });

  it('does not flag a prerequisite that is absent from the path entirely', () => {
    // number-bonds' prerequisite (addition-within-20) is not in the path at all —
    // no ordering constraint applies, but coming-soon exclusion still governs
    // whether addition-within-20 itself could ever be listed (it isn't here).
    const violations = validateCuratedPath(GRAPH_FIXTURE, ['number-bonds']);
    expect(violations).toEqual([]);
  });

  it('never throws on an empty path', () => {
    expect(validateCuratedPath(GRAPH_FIXTURE, [])).toEqual([]);
  });
});
