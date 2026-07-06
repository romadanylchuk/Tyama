/**
 * Tests for src/config/placement.ts (stage 07 Phase 1)
 *
 * Verifies:
 * - PLACEMENT_CONFIG is frozen (config-as-data invariant)
 * - every ascentChain node + floorNodeId exists in the live graph
 *   (loadGraph()) and resolves to 'available' (generator-backed)
 * - seedCoordinate sits strictly below DEFAULT_MASTERY_CONFIG.masteryThreshold
 *   and at-or-below DEFAULT_MASTERY_CONFIG.abstractFade (the mastery-gate
 *   safety invariant that makes placement structurally incapable of
 *   claiming mastery)
 * - minProbes <= probeCount (the shortenable-floor invariant)
 */

import { PLACEMENT_CONFIG } from '../placement';
import { loadGraph } from '@/core/graph/load-graph';
import { resolveAvailability } from '@/core/generators/registry';
import { DEFAULT_MASTERY_CONFIG } from '@/core/mastery/mastery-config';

describe('PLACEMENT_CONFIG — config-as-data shape', () => {
  it('is frozen at the top level', () => {
    expect(Object.isFrozen(PLACEMENT_CONFIG)).toBe(true);
  });

  it('minProbes <= probeCount (shortenable floor)', () => {
    expect(PLACEMENT_CONFIG.minProbes).toBeLessThanOrEqual(PLACEMENT_CONFIG.probeCount);
  });

  it('minProbes is at least 1 (0 probes is the separate skip-to-floor path)', () => {
    expect(PLACEMENT_CONFIG.minProbes).toBeGreaterThanOrEqual(1);
  });
});

describe('PLACEMENT_CONFIG — mastery-gate safety', () => {
  it('seedCoordinate is strictly below DEFAULT_MASTERY_CONFIG.masteryThreshold', () => {
    expect(PLACEMENT_CONFIG.seedCoordinate).toBeLessThan(DEFAULT_MASTERY_CONFIG.masteryThreshold);
  });

  it('seedCoordinate is at or below DEFAULT_MASTERY_CONFIG.abstractFade', () => {
    expect(PLACEMENT_CONFIG.seedCoordinate).toBeLessThanOrEqual(DEFAULT_MASTERY_CONFIG.abstractFade);
  });
});

describe('PLACEMENT_CONFIG — ascentChain / floorNodeId are live, generator-backed graph nodes', () => {
  const graph = loadGraph();
  const availability = resolveAvailability(graph);
  const availabilityById = new Map(availability.map((a) => [a.nodeId, a.status]));
  const graphNodeIds = new Set(graph.nodes.map((n) => n.id));

  it('every ascentChain node exists in the live graph', () => {
    for (const nodeId of PLACEMENT_CONFIG.ascentChain) {
      expect(graphNodeIds.has(nodeId)).toBe(true);
    }
  });

  it('every ascentChain node resolves to \'available\' (generator-backed)', () => {
    for (const nodeId of PLACEMENT_CONFIG.ascentChain) {
      expect(availabilityById.get(nodeId)).toBe('available');
    }
  });

  it('floorNodeId exists in the live graph', () => {
    expect(graphNodeIds.has(PLACEMENT_CONFIG.floorNodeId)).toBe(true);
  });

  it("floorNodeId resolves to 'available' (generator-backed)", () => {
    expect(availabilityById.get(PLACEMENT_CONFIG.floorNodeId)).toBe('available');
  });

  it('floorNodeId matches ascentChain[0] (documented default)', () => {
    expect(PLACEMENT_CONFIG.floorNodeId).toBe(PLACEMENT_CONFIG.ascentChain[0]);
  });

  it('ascentChain supports the abstract representation level on every node', () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const nodeId of PLACEMENT_CONFIG.ascentChain) {
      const node = byId.get(nodeId);
      expect(node).toBeDefined();
      expect(node!.representationLevels).toContain('abstract');
    }
  });
});
