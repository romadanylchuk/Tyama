/**
 * useMastery.test.ts — useMastery() read-hook tests (Stage 06, Phase 4).
 *
 * Covers the Phase 4 completion criterion:
 *   - Builds the aggregate map from seeded progress rows for every graph node.
 *   - Re-derives on a simulated durable-event tick (subscribeDurable).
 *   - Mount catch-up (readDurableSince) reflects durable state without
 *     double-counting (a full re-read on every signal, never an incremental
 *     accumulation, makes double-counting structurally impossible).
 */

import { renderHook, waitFor } from '@testing-library/react-native';

import { useTestDb } from '../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { getProgress, upsertNonMilestoneProgress } from '@/repositories/progress-repository';
import { recordMilestone } from '@/repositories/milestone-gate';
import { loadGraph } from '@/core/graph/load-graph';
import { serializeMasteryMetrics } from '@/core/mastery/mastery-metrics';
import { useMastery } from '../useMastery';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

/** Seed a node's progress row with a given aggregate mastery scalar. */
async function seedAggregate(nodeId: string, aggregate: number): Promise<void> {
  const mastery = {
    slices: { abstract: { window: [aggregate], scalar: aggregate } },
    aggregate,
  };
  await upsertNonMilestoneProgress({
    nodeId,
    metrics: serializeMasteryMetrics({}, mastery),
  });
}

describe('useMastery', () => {
  it('builds an aggregate map with one entry per graph node', async () => {
    const graph = loadGraph();
    const { result } = renderHook(() => useMastery());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.aggregates.size).toBe(graph.nodes.length);
    for (const node of graph.nodes) {
      expect(result.current.aggregates.has(node.id)).toBe(true);
    }
  });

  it('reflects a seeded progress row aggregate for a specific node', async () => {
    const graph = loadGraph();
    const targetNode = graph.nodes.find((n) => n.id === 'fruit-equations')!;
    await seedAggregate(targetNode.id, 0.65);

    const { result } = renderHook(() => useMastery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.aggregates.get(targetNode.id)).toBeCloseTo(0.65, 5);
  });

  it('untouched nodes (no progress row) report aggregate 0', async () => {
    const { result } = renderHook(() => useMastery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const graph = loadGraph();
    for (const node of graph.nodes) {
      const row = await getProgress(node.id);
      if (row === null) {
        expect(result.current.aggregates.get(node.id)).toBe(0);
      }
    }
  });

  it('re-derives on a real durable-event tick (recordMilestone → subscribeDurable)', async () => {
    const graph = loadGraph();
    const targetNode = graph.nodes.find((n) => n.id === 'fruit-equations')!;

    const { result } = renderHook(() => useMastery());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aggregates.get(targetNode.id)).toBe(0);

    // Mutate the underlying row directly (simulating another module's write
    // — e.g. ingestAttempt), then fire an UNRELATED durable event via the
    // real milestone gate. The hook must react to ANY durable tick (it does
    // not filter by kind/node) and re-read every graph node's row — proving
    // the hook's own internal subscribeDurable wiring, not a manual refresh().
    await seedAggregate(targetNode.id, 0.9);
    await recordMilestone({ kind: 'first_domain_completed' });

    await waitFor(() =>
      expect(result.current.aggregates.get(targetNode.id)).toBeCloseTo(0.9, 5)
    );
  });

  it('mount catch-up reflects durable state without double-counting', async () => {
    const graph = loadGraph();
    const targetNode = graph.nodes.find((n) => n.id === 'multiplication')!;
    // Seed BEFORE mounting — simulates an event that happened before the
    // hook existed. Because every refresh is a full re-read (never an
    // incremental accumulation), the mount-catch-up read converges to the
    // correct value regardless of how many refresh signals fire.
    await seedAggregate(targetNode.id, 0.42);

    const { result } = renderHook(() => useMastery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.aggregates.get(targetNode.id)).toBeCloseTo(0.42, 5);

    // A second, redundant refresh (simulating an overlapping live tick) must
    // converge to the SAME value, not double-apply anything.
    result.current.refresh();
    await waitFor(() =>
      expect(result.current.aggregates.get(targetNode.id)).toBeCloseTo(0.42, 5)
    );
  });
});
