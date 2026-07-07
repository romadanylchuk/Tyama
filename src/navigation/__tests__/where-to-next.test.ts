/**
 * where-to-next.test.ts — Pure priority-merge tests (Stage 06, Phase 5).
 *
 * Covers the Phase 5 completion criterion:
 *   - diagnostic-debt wins over everything else.
 *   - due-reviews are second priority; the session cap bounds them so an
 *     oversized queue can never dominate.
 *   - curated fallback skips a mastered node and a not-yet-open node.
 *   - returns null calmly when nothing is proposable — never throws.
 */

import { whereToNext } from '../where-to-next';
import { GRAPH_FIXTURE } from '@/core/graph/graph-fixture';
import type { GraphDefinition } from '@/core/types';
import type { MasteryLookup } from '@/core/routing/routing-types';
import type { ReviewItem } from '@/core/spaced-repetition';

/**
 * GRAPH_FIXTURE plus one synthetic generator-less node — used ONLY by the
 * coming-soon curated-fallback test below. Every real GRAPH_FIXTURE node is
 * generator-backed as of graphVersion 0.2.1 (addition-within-20 and
 * unknown-as-missing-addend gained generators; still true at graphVersion
 * 0.3.0, which only adds further generator-backed nodes), so the fixture no longer has
 * a naturally-occurring 'coming-soon' node to exercise that skip-path with.
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

/** Builds a MasteryLookup from a plain aggregate map; absent nodes are untouched. */
function lookup(aggregates: Record<string, number>): MasteryLookup {
  return (nodeId) => ({
    aggregate: aggregates[nodeId] ?? 0,
    untouched: !(nodeId in aggregates),
  });
}

function reviewItem(nodeId: string, dueAt: number): ReviewItem {
  return { nodeId, dueAt, intervalBandIndex: 0 };
}

describe('whereToNext', () => {
  it('diagnostic-debt wins over due-reviews and curated path', () => {
    const result = whereToNext({
      diagnosticDebt: 'number-bonds',
      dueReviews: [reviewItem('multiplication', 100)],
      curatedPath: ['fruit-equations'],
      graph: GRAPH_FIXTURE,
      masteryLookup: lookup({}),
    });
    expect(result).toEqual({ nodeId: 'number-bonds', source: 'diagnostic-debt' });
  });

  it('with no diagnostic debt, the most-overdue due-review wins (second priority)', () => {
    const result = whereToNext({
      diagnosticDebt: null,
      dueReviews: [reviewItem('multiplication', 100), reviewItem('fruit-equations', 200)],
      curatedPath: ['number-bonds'],
      graph: GRAPH_FIXTURE,
      masteryLookup: lookup({}),
    });
    expect(result).toEqual({ nodeId: 'multiplication', source: 'due-review' });
  });

  it('a session cap of 0 excludes ALL due reviews (however many are queued), falling through to curated', () => {
    const oversizedQueue: ReviewItem[] = Array.from({ length: 10 }, (_, i) =>
      reviewItem('multiplication', i)
    );
    const result = whereToNext({
      diagnosticDebt: null,
      dueReviews: oversizedQueue,
      curatedPath: ['fruit-equations'],
      graph: GRAPH_FIXTURE,
      masteryLookup: lookup({}),
      sessionCap: 0,
    });
    expect(result).toEqual({ nodeId: 'fruit-equations', source: 'curated' });
  });

  it('defaults the session cap to DUE_REVIEW_SESSION_CAP when not provided (non-empty capped slice still surfaces)', () => {
    const result = whereToNext({
      diagnosticDebt: null,
      dueReviews: [reviewItem('multiplication', 1)],
      curatedPath: [],
      graph: GRAPH_FIXTURE,
      masteryLookup: lookup({}),
    });
    expect(result).toEqual({ nodeId: 'multiplication', source: 'due-review' });
  });

  it('curated fallback skips an already-mastered node and proposes the next one', () => {
    const result = whereToNext({
      diagnosticDebt: null,
      dueReviews: [],
      curatedPath: ['number-bonds', 'fruit-equations'],
      graph: GRAPH_FIXTURE,
      // number-bonds at 0.9 >= default masteryThreshold (0.8) — already mastered.
      masteryLookup: lookup({ 'number-bonds': 0.9 }),
    });
    expect(result).toEqual({ nodeId: 'fruit-equations', source: 'curated' });
  });

  it('curated fallback skips a node that is not-yet-open (coming-soon, no registered generator)', () => {
    const result = whereToNext({
      diagnosticDebt: null,
      dueReviews: [],
      // 'ghost-foundation' has no registered generator (synthetic node, see
      // GRAPH_WITH_GHOST above) — every real fixture node is generator-backed.
      curatedPath: ['ghost-foundation', 'fruit-equations'],
      graph: GRAPH_WITH_GHOST,
      masteryLookup: lookup({}),
    });
    expect(result).toEqual({ nodeId: 'fruit-equations', source: 'curated' });
  });

  it('returns null calmly when nothing is proposable — never throws', () => {
    const result = whereToNext({
      diagnosticDebt: null,
      dueReviews: [],
      curatedPath: ['number-bonds'],
      graph: GRAPH_FIXTURE,
      // Fully mastered — no further curated candidate.
      masteryLookup: lookup({ 'number-bonds': 1.0 }),
    });
    expect(result).toBeNull();
  });

  it('an empty curated path with no debt and no due reviews returns null', () => {
    const result = whereToNext({
      diagnosticDebt: undefined,
      dueReviews: [],
      curatedPath: [],
      graph: GRAPH_FIXTURE,
      masteryLookup: lookup({}),
    });
    expect(result).toBeNull();
  });
});
