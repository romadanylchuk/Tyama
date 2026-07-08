/**
 * NodeMapScreen.tsx — the scrollable skill-graph-as-mastery-map (Stage 06,
 * Phase 6).
 *
 * COMPOSES (consumes, never reimplements):
 *   - `layoutNodes(loadGraph())` (this phase) — deterministic row/col layout
 *     + the reserved companion-slot region.
 *   - `useMastery()` (Phase 4) — the per-node aggregate map, feeding
 *     `deriveRingState` (Phase 4) alongside `resolveAvailability` (stage 02).
 *   - `useMotivation()` (Phase 4, refreshed on mount) — the streak/XP chrome.
 *   - `MasteryRing` (Phase 4) — one ring per node.
 *   - `useT()` / `useTheme()` — every label resolves via the i18n seam.
 *   - `pickSelfCheckNode` (@/navigation) — the staleness-weighted draw behind
 *     the voluntary "Перевір себе" button (visible once ≥1 node is mastered);
 *     launches through the ordinary `onSelectNode` path.
 *
 * ANTI-SHAME:
 *   `'not-yet-open'` nodes render muted and INERT (no `onPress`, no padlock,
 *   no "locked" wording — `MasteryRing` itself already guarantees the
 *   vocabulary; this screen additionally never wires a tap handler to a
 *   not-yet-open node, so there is no error/disabled feedback to suppress).
 *
 * COMPANION LAYOUT ROOM (placement constraint — see `node-layout.ts`):
 *   `layout.companionSlot` reserves a fixed row below the deepest node row.
 *   This screen renders an empty, fixed-height spacer `View` at that row so
 *   the stage-07+ cosmetic companion can bind there later without any
 *   relayout of the node grid above it. No companion is rendered here.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NodeId } from '@/core/types';
import { loadGraph } from '@/core/graph/load-graph';
import { resolveAvailability } from '@/core/generators/registry';
import { resolveMasteryConfig } from '@/core/mastery/mastery-config';
import { createSeededRng } from '@/core/rng/seeded-rng';
import { pickSelfCheckNode, type SelfCheckCandidate } from '@/navigation';
import { getProgress, appendFirehose } from '@/repositories';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { nodeDisplayName } from '@/i18n/node-name';
import { deriveRingState, useMastery, useMotivation, MasteryRing } from '@/motivation';
import { layoutNodes, type NodeLayoutEntry } from './node-layout';

// ---------------------------------------------------------------------------
// NodeMapScreenProps
// ---------------------------------------------------------------------------

export interface NodeMapScreenProps {
  /** Called when the learner taps an available/in-progress/mastered node. */
  readonly onSelectNode: (nodeId: NodeId) => void;
  /**
   * The node `whereToNext` would propose right now (computed by AppShell) —
   * highlighted so the map GUIDES instead of presenting an unranked grid.
   * Null/absent: no highlight (nothing proposable, or caller opted out).
   */
  readonly recommendedNodeId?: NodeId | null;
  /**
   * Nodes with a spaced-repetition review currently due (dueAt <= now).
   * Marked with a calm "час повторити" hint — otherwise the engine's routing
   * to them at session start feels random to the learner.
   */
  readonly dueNodeIds?: ReadonlySet<NodeId>;
  /**
   * The node of the most recent task session (tracked by AppShell). The
   * self-check pick excludes it so leaving a theme and pressing the button
   * always yields a different one — unless it is the ONLY mastered node, in
   * which case a repeat beats a dead button.
   */
  readonly lastVisitedNodeId?: NodeId | null;
}

const ROW_HEIGHT = 96;
const COMPANION_SLOT_HEIGHT = 80;

// ---------------------------------------------------------------------------
// NodeMapScreen
// ---------------------------------------------------------------------------

export function NodeMapScreen({
  onSelectNode,
  recommendedNodeId,
  dueNodeIds,
  lastVisitedNodeId,
}: NodeMapScreenProps): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();
  const mastery = useMastery();
  const motivation = useMotivation();

  const graph = useMemo(() => loadGraph(), []);
  const layout = useMemo(() => layoutNodes(graph), [graph]);
  const availabilityByNode = useMemo(
    () => new Map(resolveAvailability(graph).map((a) => [a.nodeId, a.status] as const)),
    [graph]
  );
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n] as const)), [graph]);

  // The self-check candidate pool: every node whose ring is 'mastered' (same
  // predicate as the tiles below). useMastery refreshes on durable events, so
  // the button appears/updates on its own after each session.
  const masteredNodeIds = useMemo(
    () =>
      graph.nodes
        .filter((node) => {
          const availability = availabilityByNode.get(node.id) ?? 'coming-soon';
          const aggregate = mastery.aggregates.get(node.id) ?? 0;
          return (
            deriveRingState(
              aggregate,
              availability,
              resolveMasteryConfig(node),
              mastery.abstractAttempts.get(node.id) ?? 0
            ).state === 'mastered'
          );
        })
        .map((node) => node.id),
    [graph, availabilityByNode, mastery.aggregates, mastery.abstractAttempts]
  );

  // Voluntary retrieval practice: pick a mastered node weighted toward the
  // ones practiced longest ago (staleness read at press time so it is never a
  // stale mount snapshot), then launch it through the ordinary onSelectNode
  // path — the full session pipeline (mastery/XP/SR) applies unchanged.
  const selfCheckInFlight = useRef(false);
  const handleSelfCheck = useCallback((): void => {
    if (selfCheckInFlight.current) return;
    selfCheckInFlight.current = true;
    void (async (): Promise<void> => {
      // Never re-serve the theme the learner just left — unless it is the only
      // mastered one (a repeat beats a dead button).
      const pool =
        masteredNodeIds.length > 1
          ? masteredNodeIds.filter((id) => id !== lastVisitedNodeId)
          : masteredNodeIds;
      const now = Date.now();
      let candidates: SelfCheckCandidate[];
      try {
        const rows = await Promise.all(
          pool.map(async (nodeId) => ({ nodeId, row: await getProgress(nodeId) }))
        );
        candidates = rows.map(({ nodeId, row }) => ({
          nodeId,
          // Defensive: a mastered node always has a row; a missing one reads
          // maximally stale rather than being dropped.
          staleSinceMs: now - (row?.updatedAt ?? 0),
        }));
      } catch {
        // Calm degradation: equal staleness = uniform pick; the tap never dies.
        candidates = pool.map((nodeId) => ({ nodeId, staleSinceMs: 0 }));
      }
      const picked = pickSelfCheckNode(candidates, createSeededRng(now));
      selfCheckInFlight.current = false;
      if (picked === null) return;
      appendFirehose('self_check_started', { nodeId: picked }).catch(() => {});
      onSelectNode(picked);
    })();
  }, [masteredNodeIds, lastVisitedNodeId, onSelectNode]);

  const rows = useMemo(() => {
    const byRow = new Map<number, NodeLayoutEntry[]>();
    for (const entry of layout.entries) {
      const list = byRow.get(entry.row) ?? [];
      list.push(entry);
      byRow.set(entry.row, list);
    }
    return [...byRow.entries()].sort(([a], [b]) => a - b);
  }, [layout]);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.color.background }}
      contentContainerStyle={styles.content}
      testID="node-map-screen"
    >
      <View style={styles.chrome}>
        <Text style={[styles.appName, { color: tokens.color.textPrimary }]}>
          {t({ key: 'common.appName' })}
        </Text>
        <Text style={{ color: tokens.color.textSecondary }}>
          {t({ key: 'streak.kept', vars: { count: motivation.streak } })}
        </Text>
        <Text style={{ color: tokens.color.textSecondary }}>
          {t({ key: 'task.xpEarned', vars: { xp: motivation.xp } })}
        </Text>
        {masteredNodeIds.length > 0 ? (
          <TouchableOpacity
            style={[styles.selfCheckButton, { borderColor: tokens.color.accent }]}
            onPress={handleSelfCheck}
            accessibilityRole="button"
            testID="node-map-self-check"
          >
            <Text style={[styles.selfCheckLabel, { color: tokens.color.accent }]}>
              {t({ key: 'nav.selfCheck' })}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {rows.map(([row, entries]) => (
        <View key={row} style={styles.row} testID={`node-map-row-${row}`}>
          {entries.map((entry) => {
            const node = nodeById.get(entry.nodeId);
            if (!node) return null;
            const availability = availabilityByNode.get(entry.nodeId) ?? 'coming-soon';
            const aggregate = mastery.aggregates.get(entry.nodeId) ?? 0;
            const ringState = deriveRingState(
              aggregate,
              availability,
              resolveMasteryConfig(node),
              mastery.abstractAttempts.get(entry.nodeId) ?? 0
            );
            const inert = ringState.state === 'not-yet-open';
            const isRecommended = entry.nodeId === recommendedNodeId;
            const isDue = dueNodeIds?.has(entry.nodeId) ?? false;

            return (
              <TouchableOpacity
                key={entry.nodeId}
                style={[
                  styles.tile,
                  isRecommended
                    ? [styles.tileRecommended, { borderColor: tokens.color.accent }]
                    : null,
                ]}
                disabled={inert}
                onPress={() => onSelectNode(entry.nodeId)}
                accessibilityRole="button"
                testID={`node-map-tile-${entry.nodeId}`}
              >
                <MasteryRing
                  nodeId={entry.nodeId}
                  fill={ringState.fill}
                  state={ringState.state}
                />
                <Text
                  style={[styles.tileLabel, { color: tokens.color.textSecondary }]}
                  numberOfLines={2}
                >
                  {nodeDisplayName(t, entry.nodeId)}
                </Text>
                {isRecommended ? (
                  <Text
                    style={[styles.tileBadge, { color: tokens.color.accent }]}
                    testID={`node-map-recommended-${entry.nodeId}`}
                  >
                    {t({ key: 'nav.recommended' })}
                  </Text>
                ) : null}
                {isDue ? (
                  <Text
                    style={[styles.tileBadge, { color: tokens.color.textSecondary }]}
                    testID={`node-map-due-${entry.nodeId}`}
                  >
                    {t({ key: 'nav.reviewDue' })}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Reserved companion-slot region — see node-layout.ts's CompanionSlot.
          Intentionally empty; the stage-07+ cosmetic companion binds here. */}
      <View
        style={[styles.companionSlot, { height: COMPANION_SLOT_HEIGHT }]}
        testID="node-map-companion-slot"
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  chrome: {
    gap: 4,
    marginBottom: 12,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    minHeight: ROW_HEIGHT,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: 120,
  },
  tileLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  tileRecommended: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tileBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  selfCheckButton: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  selfCheckLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  companionSlot: {
    width: '100%',
  },
});
