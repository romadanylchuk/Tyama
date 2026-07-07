/**
 * registry.ts — Static GENERATORS registry and availability resolution.
 *
 * PURPOSE:
 *   The GENERATORS map is the build-time registry of all installed Generator
 *   implementations. It is keyed by NodeId (the graph node slug the generator
 *   handles) and populated by explicit static imports — no decorators, no
 *   dynamic registration, no side effects.
 *
 * DL-6 ASYMMETRY (never-throw vs hard-error):
 *   - `getGenerator(nodeId)` returns `undefined` if the node has no installed
 *     generator. This is the OTA-skew case: a newly-deployed graph node that
 *     has no generator yet is legitimate. NEVER throws.
 *   - `resolveAvailability(nodeId)` returns a status-as-value:
 *       'available'   — generator installed for this node.
 *       'coming-soon' — no generator yet (or node not in graph — same treatment).
 *     ANTI-SHAME: these are the ONLY two status values. Never 'locked',
 *     'disabled', 'error', 'unavailable', or any shaming vocabulary.
 *   - `assertEveryGeneratorHasNode(graph, generators)` is the HARD-ERROR half:
 *     a generator keyed to a node ID that does not exist in the graph is a
 *     build mistake (the developer forgot to add the node). This is caught at
 *     startup/CI, not at runtime user interaction time.
 *
 * AVAILABILITY vs PRESENCE:
 *   `resolveAvailability` returns status for ALL nodes in the graph (including
 *   generator-less ones) plus gracefully handles unknown nodeIds. It does NOT
 *   distinguish "node exists in graph but no generator" from "node not in graph
 *   at all" — both are 'coming-soon'. This keeps the UI layer free of
 *   availability-error distinctions.
 *
 * STATIC POPULATION:
 *   Generators are registered by explicit import — no decorator / self-registration
 *   pattern. This ensures:
 *     - Tree-shaking (bundlers see static imports).
 *     - Type safety (the map is Readonly<Record<NodeId, Generator>>).
 *     - Testability (the map is a plain frozen object; tests can inspect it).
 *
 * ANTI-SHAME VOCABULARY GUARD:
 *   A comment-level assertion is included below, and a test in
 *   `registry.test.ts` greps the module surface for forbidden words.
 */

import type { NodeId } from '@/db/types';
import type { Generator, GraphDefinition } from '@/core/types';
import { fruitEquations } from './fruit-equations';
import { numberBonds } from './number-bonds';
import { multiplication } from './multiplication';
import { fractionSimplification } from './fraction-simplification';
import { additionWithin20 } from './addition-within-20';
import { unknownAsMissingAddend } from './unknown-as-missing-addend';
import { subtractionWithin20 } from './subtraction-within-20';
import { placeValue } from './place-value';
import { division } from './division';
import { rounding } from './rounding';
import { wordProblems } from './word-problems';
import { decimalComparison } from './decimal-comparison';

// ---------------------------------------------------------------------------
// GENERATORS — the static frozen registry
// ---------------------------------------------------------------------------

/**
 * GENERATORS — all installed Generator implementations.
 *
 * Key: the NodeId (graph slug) the generator handles.
 * Value: the Generator implementation.
 *
 * Population rule: ONE explicit import per generator, ONE entry per import.
 * "A new level = a new module + a graph node + one new entry here."
 *
 * This map is frozen at module load time so no runtime code can mutate it.
 */
export const GENERATORS: Readonly<Record<NodeId, Generator>> = Object.freeze({
  'fruit-equations': fruitEquations,
  'number-bonds': numberBonds,
  'multiplication': multiplication,
  'fraction-simplification': fractionSimplification,
  'addition-within-20': additionWithin20,
  'unknown-as-missing-addend': unknownAsMissingAddend,
  'subtraction-within-20': subtractionWithin20,
  'place-value': placeValue,
  'division': division,
  'rounding': rounding,
  'word-problems': wordProblems,
  'decimal-comparison': decimalComparison,
});

// ---------------------------------------------------------------------------
// NodeAvailability — the status type
// ---------------------------------------------------------------------------

/**
 * Availability status for a graph node's generator.
 *
 * ANTI-SHAME VOCABULARY:
 *   Only 'available' and 'coming-soon' are valid status values.
 *   Never 'locked', 'disabled', 'error', 'unavailable', or 'blocked'.
 *   (Forbidden words: locked / disabled / error / unavailable / blocked / pending)
 */
export type NodeAvailabilityStatus = 'available' | 'coming-soon';

export interface NodeAvailability {
  readonly nodeId: NodeId;
  readonly status: NodeAvailabilityStatus;
}

// ---------------------------------------------------------------------------
// getGenerator — never throws
// ---------------------------------------------------------------------------

/**
 * getGenerator(nodeId): Generator | undefined
 *
 * Returns the installed Generator for `nodeId`, or `undefined` if no
 * generator is installed for this node (the 'coming-soon' case).
 *
 * This function NEVER throws. An unknown nodeId returns `undefined`;
 * the caller decides what to do with it (typically: show 'coming-soon' UI).
 *
 * The OTA-skew case: a newly-deployed graph node that has no matching
 * generator yet is legitimate — the app has not yet been updated. Never
 * crash on this condition.
 *
 * @param nodeId - The graph node slug (e.g. 'fruit-equations').
 * @returns The Generator, or `undefined` if not installed.
 */
export function getGenerator(nodeId: NodeId): Generator | undefined {
  return GENERATORS[nodeId];
}

// ---------------------------------------------------------------------------
// hasGenerator
// ---------------------------------------------------------------------------

/**
 * hasGenerator(nodeId): boolean
 *
 * Returns `true` if a generator is installed for `nodeId`.
 * Convenience wrapper over `getGenerator` for conditional branching.
 *
 * @param nodeId - The graph node slug.
 */
export function hasGenerator(nodeId: NodeId): boolean {
  return nodeId in GENERATORS;
}

// ---------------------------------------------------------------------------
// resolveAvailability — status-as-value, never throws
// ---------------------------------------------------------------------------

/**
 * resolveAvailability(graph): NodeAvailability[]
 *
 * Returns the availability status for every node in the graph.
 * Each node is either 'available' (has an installed generator) or
 * 'coming-soon' (no generator yet — includes OTA graph nodes and
 * nodes planned for future stages).
 *
 * Status vocabulary is strictly 'available' | 'coming-soon'.
 * No shaming words ('locked', 'disabled', etc.) are ever returned.
 *
 * @param graph - The loaded GraphDefinition (from loadGraph()).
 * @returns     - An array of { nodeId, status } entries, one per graph node.
 */
export function resolveAvailability(graph: GraphDefinition): NodeAvailability[] {
  return graph.nodes.map((node) => ({
    nodeId: node.id,
    status: hasGenerator(node.id) ? 'available' : 'coming-soon',
  }));
}

// ---------------------------------------------------------------------------
// assertEveryGeneratorHasNode — the hard-error half (build mistake catcher)
// ---------------------------------------------------------------------------

/**
 * AssertEveryGeneratorHasNodeError — thrown by `assertEveryGeneratorHasNode`.
 *
 * This is a programmer error: a generator is registered for a node ID that
 * does not exist in the graph. Either the graph node was removed without
 * removing the generator, or the generator was added with the wrong node ID.
 */
export class AssertEveryGeneratorHasNodeError extends Error {
  /** The generator node IDs that have no matching graph node. */
  readonly danglingKeys: readonly NodeId[];

  constructor(danglingKeys: NodeId[]) {
    super(
      'AssertEveryGeneratorHasNodeError: the following registered generator keys have no ' +
        'matching node in the graph — this is a build mistake:\n' +
        danglingKeys.map((k) => `  '${k}'`).join('\n') +
        '\n' +
        'Either add the missing node(s) to the graph asset or remove the dangling generator(s).'
    );
    this.name = 'AssertEveryGeneratorHasNodeError';
    this.danglingKeys = Object.freeze([...danglingKeys]);
  }
}

/**
 * assertEveryGeneratorHasNode(graph, generators): void
 *
 * The HARD-ERROR half of the DL-6 asymmetry (compare with `getGenerator` which
 * is the never-throw half).
 *
 * A generator keyed to a node ID that does not exist in the graph is a build
 * mistake — it means either:
 *   (a) the graph node was removed without removing the generator, or
 *   (b) the generator was registered with the wrong node ID.
 *
 * This assertion is intended to run at startup and in CI (not at runtime user
 * interaction time). It throws `AssertEveryGeneratorHasNodeError` listing all
 * dangling generator keys.
 *
 * Note the deliberate asymmetry:
 *   - A graph node WITH no generator → graceful 'coming-soon' (fine).
 *   - A generator WITH no graph node → HARD ERROR (build mistake, caught here).
 *
 * @param graph      - The loaded GraphDefinition to check against.
 * @param generators - The generator map to validate (defaults to GENERATORS).
 * @throws {AssertEveryGeneratorHasNodeError} If any generator has no graph node.
 */
export function assertEveryGeneratorHasNode(
  graph: GraphDefinition,
  generators: Readonly<Record<NodeId, Generator>> = GENERATORS
): void {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const dangling: NodeId[] = [];

  for (const key of Object.keys(generators) as NodeId[]) {
    if (!nodeIds.has(key)) {
      dangling.push(key);
    }
  }

  if (dangling.length > 0) {
    throw new AssertEveryGeneratorHasNodeError(dangling);
  }
}

// ---------------------------------------------------------------------------
// validateRegistry — convenience wrapper for startup/CI use
// ---------------------------------------------------------------------------

/**
 * validateRegistry(graph): void
 *
 * Delegates to `assertEveryGeneratorHasNode(graph, GENERATORS)`.
 * Intended for use in App.tsx startup or CI assertions to verify the registry
 * is consistent with the loaded graph.
 *
 * @param graph - The loaded GraphDefinition (from loadGraph()).
 * @throws {AssertEveryGeneratorHasNodeError} If any generator has no graph node.
 */
export function validateRegistry(graph: GraphDefinition): void {
  assertEveryGeneratorHasNode(graph, GENERATORS);
}
