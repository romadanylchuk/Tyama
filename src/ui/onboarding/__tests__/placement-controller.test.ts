/**
 * placement-controller.test.ts — PlacementController ladder orchestration
 * tests (stage 07, Phase 2).
 *
 * Covers the Phase 2 completion criterion:
 *   (a) N correct probes seed N ascending nodes each <= abstractFade;
 *       currentNodeId = the ascent stop.
 *   (b) a failed-step on probe k stops the ladder, seeds nothing on/after k,
 *       and never touches what was already seeded before k.
 *   (c) a parse-error re-prompts without consuming the probe or writing.
 *   (d) skipToFloor() writes zero progress rows and sets
 *       currentNodeId = floorNodeId (untouched -> aggregate 0).
 *   (e) finish() never returns null, even if no probe was ever recorded.
 *   (f) structural: the module imports neither milestone-gate nor
 *       @/core/routing.
 */

import * as fs from 'fs';
import * as path from 'path';

import { useTestDb } from '../../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { getProgress } from '@/repositories/progress-repository';
import { parseMasteryMetrics } from '@/core/mastery/mastery-metrics';
import { DEFAULT_MASTERY_CONFIG } from '@/core/mastery/mastery-config';
import { PLACEMENT_CONFIG } from '@/config/placement';
import { createPlacementController } from '../placement-controller';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

describe('PlacementController — correct-probe ascent', () => {
  it('N correct probes seed N ascending nodes each <= abstractFade; currentNodeId = ascent stop', async () => {
    const controller = createPlacementController();
    const touched: string[] = [];

    let node = controller.currentProbeNode();
    while (node !== null) {
      touched.push(node);
      await controller.recordProbe({ kind: 'correct' });
      node = controller.currentProbeNode();
    }

    expect(touched).toEqual(
      PLACEMENT_CONFIG.ascentChain.slice(0, PLACEMENT_CONFIG.probeCount)
    );

    for (const nodeId of touched) {
      const row = await getProgress(nodeId);
      expect(row).not.toBeNull();
      const { mastery } = parseMasteryMetrics(row!.metrics);
      expect(mastery.aggregate).toBeLessThanOrEqual(DEFAULT_MASTERY_CONFIG.abstractFade);
      expect(mastery.aggregate).toBeLessThan(DEFAULT_MASTERY_CONFIG.masteryThreshold);
    }

    const entryNode = await controller.finish();
    expect(entryNode).toBe(touched[touched.length - 1]);
    expect(settings.get('currentNodeId')).toBe(entryNode);
  });
});

describe('PlacementController — failed-step stops the ladder non-shamingly', () => {
  it('stops immediately, seeds nothing on/after k, and never touches what was seeded before k', async () => {
    const controller = createPlacementController();

    const firstNode = controller.currentProbeNode();
    expect(firstNode).not.toBeNull();
    await controller.recordProbe({ kind: 'correct' });
    const firstRowAfterSeed = await getProgress(firstNode!);
    expect(firstRowAfterSeed).not.toBeNull();

    const secondNode = controller.currentProbeNode();
    expect(secondNode).not.toBeNull();
    expect(secondNode).not.toBe(firstNode);

    await controller.recordProbe({ kind: 'failed-step' });

    // Ladder stops immediately.
    expect(controller.currentProbeNode()).toBeNull();

    // Nothing seeded for the failing node.
    const failedRow = await getProgress(secondNode!);
    expect(failedRow).toBeNull();

    // The already-seeded first node is untouched by the failure.
    const firstRowAfterFailure = await getProgress(firstNode!);
    expect(firstRowAfterFailure).toEqual(firstRowAfterSeed);

    const entryNode = await controller.finish();
    expect(entryNode).toBe(secondNode);
    expect(settings.get('currentNodeId')).toBe(secondNode);
  });
});

describe('PlacementController — parse-error re-prompts without consuming the probe', () => {
  it('does not advance the ladder or write anything', async () => {
    const controller = createPlacementController();
    const node = controller.currentProbeNode();
    expect(node).not.toBeNull();

    await controller.recordProbe({ kind: 'parse-error' });

    expect(controller.currentProbeNode()).toBe(node);
    const row = await getProgress(node!);
    expect(row).toBeNull();
  });
});

describe('PlacementController — skipToFloor', () => {
  it('writes zero progress rows and sets currentNodeId = floorNodeId (untouched -> aggregate 0)', async () => {
    const controller = createPlacementController();
    const entryNode = await controller.skipToFloor();

    expect(entryNode).toBe(PLACEMENT_CONFIG.floorNodeId);
    expect(settings.get('currentNodeId')).toBe(PLACEMENT_CONFIG.floorNodeId);

    const row = await getProgress(PLACEMENT_CONFIG.floorNodeId);
    expect(row).toBeNull();
  });
});

describe('PlacementController — finish() never returns null', () => {
  it('falls back to floorNodeId when no probe was ever recorded', async () => {
    const controller = createPlacementController();
    const entryNode = await controller.finish();

    expect(entryNode).toBe(PLACEMENT_CONFIG.floorNodeId);
    expect(entryNode).not.toBeNull();
    expect(settings.get('currentNodeId')).toBe(PLACEMENT_CONFIG.floorNodeId);
  });
});

describe('PlacementController — structural: no milestone/routing imports', () => {
  it("placement-controller.ts's import declarations reference neither milestone-gate nor @/core/routing", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../placement-controller.ts'),
      'utf-8'
    );
    // Scope the scan to actual `import … from '<module>'` STATEMENTS, scanned
    // as whole (possibly multi-line) units rather than per-line. A per-line
    // `/^\s*import\b/` filter blind-spots a wrapped import where the module
    // specifier lives on the `} from '...'` continuation line (e.g. after a
    // Prettier line-wrap) — that line never starts with `import` and would
    // never be checked, silently passing even if a forbidden module were
    // imported. Strip comments first (the file's own JSDoc legitimately names
    // both `milestone-gate` and `@/core/routing` in prose, to document what
    // this controller must NOT reach for) so only real statements are matched.
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const importStatements =
      withoutComments.match(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g) ?? [];

    expect(importStatements.length).toBeGreaterThan(0);
    for (const statement of importStatements) {
      expect(statement).not.toMatch(/milestone-gate/);
      expect(statement).not.toMatch(/core\/routing/);
    }
  });
});
