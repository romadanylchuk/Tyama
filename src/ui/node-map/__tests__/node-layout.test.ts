/**
 * node-layout.test.ts — layoutNodes() pure layout tests (Stage 06, Phase 6).
 *
 * Covers the Phase 6 completion criterion for node-layout.ts:
 *   - Deterministic rows by prerequisite depth (over the real GRAPH_FIXTURE).
 *   - The reserved companion slot is present, one row below the deepest node.
 *   - Deterministic column assignment (graph.nodes order, never re-sorted).
 */

import { GRAPH_FIXTURE } from '@/core/graph/graph-fixture';
import { layoutNodes } from '../node-layout';

describe('layoutNodes', () => {
  it('assigns rows by prerequisite depth over the real fixture graph', () => {
    const layout = layoutNodes(GRAPH_FIXTURE);
    const rowOf = (id: string): number =>
      layout.entries.find((e) => e.nodeId === id)!.row;

    // addition-within-20: root, no prerequisites -> row 0.
    expect(rowOf('addition-within-20')).toBe(0);
    // unknown-as-missing-addend: prereq addition-within-20 (row 0) -> row 1.
    expect(rowOf('unknown-as-missing-addend')).toBe(1);
    // fruit-equations: prereqs addition-within-20 (0) + unknown-as-missing-addend (1) -> row 2.
    expect(rowOf('fruit-equations')).toBe(2);
    // number-bonds: prereq addition-within-20 (0) -> row 1.
    expect(rowOf('number-bonds')).toBe(1);
    // multiplication: prereq number-bonds (1) -> row 2.
    expect(rowOf('multiplication')).toBe(2);
    // fraction-simplification: prereq fruit-equations (2) -> row 3.
    expect(rowOf('fraction-simplification')).toBe(3);
  });

  it('produces one layout entry per graph node', () => {
    const layout = layoutNodes(GRAPH_FIXTURE);
    expect(layout.entries).toHaveLength(GRAPH_FIXTURE.nodes.length);
  });

  it('reserves a companion slot one row below the deepest node row', () => {
    const layout = layoutNodes(GRAPH_FIXTURE);
    const maxRow = Math.max(...layout.entries.map((e) => e.row));
    expect(layout.companionSlot.row).toBe(maxRow + 1);
    expect(layout.companionSlot.anchor).toBe('below-map');
  });

  it('is deterministic — same graph produces byte-identical layout across calls', () => {
    const first = layoutNodes(GRAPH_FIXTURE);
    const second = layoutNodes(GRAPH_FIXTURE);
    expect(second).toEqual(first);
  });

  it('assigns columns in graph.nodes order within a row, never re-sorted', () => {
    const layout = layoutNodes(GRAPH_FIXTURE);
    // number-bonds and unknown-as-missing-addend are both row 1; number-bonds
    // appears LATER than unknown-as-missing-addend in GRAPH_FIXTURE.nodes, so
    // it must receive a HIGHER column index (insertion-order columns).
    const unknownEntry = layout.entries.find((e) => e.nodeId === 'unknown-as-missing-addend')!;
    const numberBondsEntry = layout.entries.find((e) => e.nodeId === 'number-bonds')!;
    expect(unknownEntry.row).toBe(numberBondsEntry.row);
    expect(numberBondsEntry.col).toBeGreaterThan(unknownEntry.col);
  });

  it('handles a graph with no nodes without throwing', () => {
    const empty = { graphVersion: '0.0.0', nodes: [] };
    expect(() => layoutNodes(empty)).not.toThrow();
    const layout = layoutNodes(empty);
    expect(layout.entries).toEqual([]);
    expect(layout.companionSlot.row).toBe(1); // maxRow defaults to 0 -> companion at row 1
  });
});
