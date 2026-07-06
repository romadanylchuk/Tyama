/**
 * useMastery.ts — Read hook building the per-node mastery aggregate map
 * (Stage 06, Phase 4).
 *
 * READ-ONLY CONSUMER OF THE DURABLE EVENT STREAM:
 *   `progress.metrics` (via `parseMasteryMetrics`) is ALREADY the materialized
 *   read-authority for each node's mastery aggregate — stage-04's
 *   `ingestAttempt` keeps it current on every attempt. This hook does NOT
 *   recompute mastery from the event log; a durable event is only ever a
 *   REFRESH SIGNAL telling this hook "re-read the authoritative rows now".
 *   Because every refresh is a full re-read (never an incremental
 *   accumulation), processing the same event twice (a mount-catch-up read
 *   racing a live tick) can never double-count — the last read simply wins.
 *
 * SUBSCRIBE-BEFORE-LOAD ORDERING:
 *   `subscribeDurable` is registered SYNCHRONOUSLY before the async initial
 *   load kicks off, so no event fired in the narrow window between mount and
 *   the first `getProgress` resolving can be missed.
 *
 * MOUNT CATCH-UP:
 *   `readDurableSince(0)` is awaited once on mount to absorb any durable
 *   events recorded before this hook was mounted, then a single fresh
 *   `load()` reflects the fully caught-up state. The specific events are not
 *   inspected — the resulting full re-read is what matters.
 */

import { useCallback, useEffect, useState } from 'react';
import type { NodeId } from '@/core/types';
import { loadGraph } from '@/core/graph/load-graph';
import { parseMasteryMetrics } from '@/core/mastery/mastery-metrics';
import { getProgress } from '@/repositories/progress-repository';
import { subscribeDurable, readDurableSince } from '@/repositories/events-repository';

// ---------------------------------------------------------------------------
// UseMasteryResult
// ---------------------------------------------------------------------------

export interface UseMasteryResult {
  /** NodeId → mastery aggregate scalar (0..1), one entry per graph node. */
  readonly aggregates: ReadonlyMap<NodeId, number>;
  /** True until the first successful load completes. */
  readonly loading: boolean;
  /** Force an immediate re-read of every graph node's progress row. */
  readonly refresh: () => void;
}

// ---------------------------------------------------------------------------
// useMastery
// ---------------------------------------------------------------------------

/**
 * useMastery(): UseMasteryResult
 *
 * Builds a `NodeId → aggregate` map for every node in `loadGraph()` from
 * `getProgress` + `parseMasteryMetrics`, re-deriving on every durable-event
 * tick (mastery milestones, streak events, etc. — any durable write is a
 * valid refresh signal for this read-only consumer).
 */
export function useMastery(): UseMasteryResult {
  const [aggregates, setAggregates] = useState<ReadonlyMap<NodeId, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const graph = loadGraph();
    const entries = await Promise.all(
      graph.nodes.map(async (node): Promise<readonly [NodeId, number]> => {
        const row = await getProgress(node.id);
        const { mastery } = parseMasteryMetrics(row?.metrics ?? '');
        return [node.id, mastery.aggregate] as const;
      })
    );
    setAggregates(new Map(entries));
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Subscribe FIRST — see file header (subscribe-before-load ordering).
    const unsubscribe = subscribeDurable(() => {
      void load();
    });

    void (async (): Promise<void> => {
      await readDurableSince(0); // mount catch-up (see file header)
      if (!cancelled) {
        await load();
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [load]);

  return {
    aggregates,
    loading,
    refresh: () => {
      void load();
    },
  };
}
