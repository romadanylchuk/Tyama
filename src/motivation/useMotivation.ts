/**
 * useMotivation.ts — Read hook exposing the global streak/XP display
 * (Stage 06, Phase 4).
 *
 * READ-ONLY CONSUMER, SAME REFRESH-ON-SIGNAL PATTERN AS useMastery:
 *   Streak/XP are already materialized on the `GLOBAL_MOTIVATION_NODE_ID`
 *   sentinel progress row by `recordKeptDaySession`/`awardXp` (see
 *   `streak-xp.ts`). This hook never recomputes them from the event log —
 *   a durable event (mount catch-up via `readDurableSince`, or live via
 *   `subscribeDurable`) is only ever a signal to re-read the authoritative
 *   row. Because every refresh replaces state with a full fresh read, replay
 *   (mount catch-up racing a live tick) can never double-count.
 *
 * ANTI-SHAME FLOOR GUARD:
 *   `streak`/`xp` are stored as monotonically non-decreasing values by
 *   construction (see `streak-xp.ts`), but this hook additionally applies a
 *   client-side `Math.max(prev, fresh)` floor on every read so the DISPLAYED
 *   value can never regress even transiently across an out-of-order refresh
 *   race (belt-and-suspenders, mirroring the `MAX(mastery_level, ?)` pattern
 *   used by the milestone gate). Never renders a decrease.
 *
 * PHASE 6 FIX — EXPLICIT `refresh()` (Should-fix from the Phase 4 review):
 *   `recordKeptDaySession`/`awardXp` persist via `upsertNonMilestoneProgress`,
 *   which does NOT fire `subscribeDurable` (only `recordMilestone` does — see
 *   `milestone-gate.ts`). So on any ordinary (non-milestone-crossing) session
 *   — e.g. every task after the very first kept day, or every XP award that
 *   isn't itself a mastery-milestone crossing — this hook's live subscription
 *   never re-fires, and a component holding it across multiple task
 *   submissions would render a STALE streak/xp. `refresh()` (mirroring
 *   `useMastery()`'s identical API) lets a live consumer (the Phase-6
 *   `TaskScreen` chrome) force an immediate re-read after each submission so
 *   XP/streak are never stale, without introducing a second, competing
 *   re-render pathway.
 */

import { useCallback, useEffect, useState } from 'react';
import { getProgress } from '@/repositories/progress-repository';
import { subscribeDurable, readDurableSince } from '@/repositories/events-repository';
import { GLOBAL_MOTIVATION_NODE_ID } from './streak-xp';

// ---------------------------------------------------------------------------
// UseMotivationResult
// ---------------------------------------------------------------------------

export interface UseMotivationResult {
  /** Current consecutive-kept-day streak. Never rendered as a decrease. */
  readonly streak: number;
  /** Accumulated XP. Never rendered as a decrease. */
  readonly xp: number;
  /** True until the first successful load completes. */
  readonly loading: boolean;
  /**
   * Force an immediate re-read of the sentinel row. See file header (PHASE 6
   * FIX) — call this after any action that may have changed streak/xp so a
   * long-lived consumer never renders stale chrome.
   */
  readonly refresh: () => void;
}

// ---------------------------------------------------------------------------
// useMotivation
// ---------------------------------------------------------------------------

/**
 * useMotivation(): UseMotivationResult
 *
 * Exposes `{ streak, xp }` for chrome (e.g. the node-map/task-screen header),
 * sourced from the sentinel progress row and kept current via the durable
 * event stream.
 */
export function useMotivation(): UseMotivationResult {
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const row = await getProgress(GLOBAL_MOTIVATION_NODE_ID);
    if (row !== null) {
      // Floor guard — see file header. Never renders a decrease.
      setStreak((prev) => Math.max(prev, row.streak));
      setXp((prev) => Math.max(prev, row.xp));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Subscribe FIRST so no live event fired during the initial load is missed.
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
    streak,
    xp,
    loading,
    refresh: () => {
      void load();
    },
  };
}
