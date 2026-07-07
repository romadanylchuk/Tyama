/**
 * curated-path.test.ts — validateCuratedPath guard tests (Stage 06, Phase 5).
 *
 * Covers the Phase 5 completion criterion:
 *   - `validateCuratedPath(GRAPH_FIXTURE, CURATED_ENTRY_PATH)` is `[]`.
 *   - a path referencing an absent node → violation.
 *   - a path proposing a `coming-soon` node → violation.
 *
 * NOTE: every GRAPH_FIXTURE node is generator-backed as of graphVersion 0.2.1
 * (addition-within-20 and unknown-as-missing-addend gained generators; still
 * true at graphVersion 0.3.0, which only adds further generator-backed nodes), so
 * the fixture itself no longer has a naturally-occurring 'coming-soon' node.
 * The coming-soon test below augments the fixture with a synthetic
 * generator-less node ('ghost-foundation') to exercise that guard.
 */

import { CURATED_ENTRY_PATH, validateCuratedPath } from '../curated-path';
import { GRAPH_FIXTURE } from '@/core/graph/graph-fixture';
import type { GraphDefinition } from '@/core/types';

/**
 * GRAPH_FIXTURE plus one synthetic generator-less node — used ONLY by the
 * coming-soon violation test below (no registry entry exists for
 * 'ghost-foundation', so `resolveAvailability` reports it 'coming-soon').
 */
const GRAPH_WITH_GHOST: GraphDefinition = {
  ...GRAPH_FIXTURE,
  nodes: [
    ...GRAPH_FIXTURE.nodes,
    {
      id: 'ghost-foundation',
      prerequisites: [],
      representationLevels: ['concrete'],
      difficultyHooks: { bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }] },
    },
  ],
};

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
    // 'ghost-foundation' has no registered generator (synthetic node, see
    // GRAPH_WITH_GHOST above) — every real fixture node is now generator-backed.
    const violations = validateCuratedPath(GRAPH_WITH_GHOST, ['ghost-foundation']);
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
    // number-bonds' prerequisite (addition-within-20) is not in the path at
    // all — no ordering constraint applies (and addition-within-20 is
    // generator-backed regardless, so there is no coming-soon exclusion here).
    const violations = validateCuratedPath(GRAPH_FIXTURE, ['number-bonds']);
    expect(violations).toEqual([]);
  });

  it('never throws on an empty path', () => {
    expect(validateCuratedPath(GRAPH_FIXTURE, [])).toEqual([]);
  });
});
