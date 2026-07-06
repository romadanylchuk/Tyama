/**
 * load-graph.ts — `loadGraph()` seam: returns the active skill graph asset.
 *
 * SEAM DISCIPLINE:
 *   `loadGraph()` is the single entry point for the skill graph. All consumers
 *   (generator registry, scheduler, diagnostic router) must call this function —
 *   never import `GRAPH_FIXTURE` directly. The indirection is the OTA seam:
 *   replacing the return value here (e.g. fetching a newer graph from a CDN)
 *   is the ONLY change required to introduce OTA graph updates.
 *
 * MVP IMPLEMENTATION:
 *   Returns the static `GRAPH_FIXTURE` literal. No network, no async, no cache.
 *   `loadGraph()` is synchronous because the static asset is always in memory.
 *
 * FIXTURE WARNING:
 *   If the returned graph has `fixture: true`, a dev-mode warning is emitted to
 *   `console.warn`. This ensures the smoke-test fixture can never silently
 *   masquerade as the real catalog in a production build.
 *
 * FUTURE OTA SHAPE:
 *   A future `loadGraph()` may become async (fetching from a remote source),
 *   at which point callers that currently call it synchronously will need to
 *   be updated. The startup wiring in `App.tsx` already uses `.then()` chains,
 *   so adding `async`/`await` here is the only change needed.
 */

import type { GraphDefinition } from '@/core/types';
import { GRAPH_FIXTURE } from './graph-fixture';

// ---------------------------------------------------------------------------
// loadGraph — the swappable seam
// ---------------------------------------------------------------------------

/**
 * loadGraph(): GraphDefinition
 *
 * Returns the active skill graph asset. In the MVP, this is always the static
 * `GRAPH_FIXTURE`. In future builds, this function may fetch an OTA graph asset.
 *
 * INVARIANTS:
 *   - The returned graph is always a valid `GraphDefinition` shape.
 *   - Callers MUST pass the result to `validateGraph()` before use at startup
 *     (App.tsx wiring does this via `reconcileGraphVersion`).
 *   - If `graph.fixture === true`, a `console.warn` is emitted in dev mode.
 *
 * @returns The active `GraphDefinition` asset.
 */
export function loadGraph(): GraphDefinition {
  const graph = GRAPH_FIXTURE;

  // Fixture guard: warn in all environments (not just __DEV__) so that CI
  // logs surface this flag and testers are never confused about which graph
  // is active. A production build shipping the real catalog will have
  // `fixture: false` (or absent), so this warn fires only during stage-02 dev/CI.
  if (graph.fixture === true) {
    console.warn(
      '[loadGraph] SMOKE-TEST FIXTURE active (graphVersion: ' +
        graph.graphVersion +
        '). This is NOT the MVP skill catalog. Replace GRAPH_FIXTURE with the ' +
        'real catalog asset before shipping.'
    );
  }

  return graph;
}
