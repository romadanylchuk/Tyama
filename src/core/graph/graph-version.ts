/**
 * graph-version.ts — `reconcileGraphVersion()` and the graph-migrations map.
 *
 * PURPOSE:
 *   Compares the graph-content version embedded in the asset (`graph.graphVersion`)
 *   against the version last applied on this install (`appliedGraphVersion` settings
 *   key) and runs any pending declarative node-identity migration ops.
 *
 * TWO VERSION AXES — NEVER CONFLATE:
 *   `appliedGraphVersion` (settings key)  ← graph-content axis (this file)
 *   `DB_SCHEMA_VERSION` / `PRAGMA user_version` ← DB-schema axis (migrations/index.ts)
 *
 *   These two axes migrate on entirely independent clocks. `reconcileGraphVersion`
 *   NEVER reads or writes `PRAGMA user_version`. The settings key is the lightest
 *   correct home for the graph-content axis (DL-7).
 *
 * STARTUP ORDER (App.tsx):
 *   1. `initDatabase()`     — schema migrations (PRAGMA user_version axis) FIRST.
 *   2. `settings.hydrate()` — hydrate settings cache (reads `appliedGraphVersion`).
 *   3. `reconcileGraphVersion(loadGraph())` — graph-content migrations SECOND.
 *   4. `getDeviceId()`      — device identity (reads settings cache).
 *
 *   Schema migrations are ALWAYS applied before graph-content migrations.
 *
 * FIRST-RUN BEHAVIOUR:
 *   On a fresh install, `appliedGraphVersion === ''` and `graph.graphVersion === '0.2.1'`.
 *   `reconcileGraphVersion` looks up `GRAPH_MIGRATIONS['']` → `undefined` → `[]` (no-op).
 *   `applyGraphMigrations([])` is the documented no-op (fast path, no DB access).
 *   Then `appliedGraphVersion` is persisted as `'0.2.1'`.
 *
 * UPGRADE FROM 0.1.0 → 0.2.0:
 *   On an install that previously ran `graphVersion '0.1.0'`, `appliedGraphVersion`
 *   is `'0.1.0'`. `reconcileGraphVersion` looks up `GRAPH_MIGRATIONS['0.1.0']` → `[]`
 *   (the no-op entry added for this transition — nodes are ADDED, not split/merged/renamed,
 *   so no node-identity migration ops are needed). `applyGraphMigrations([])` is the fast
 *   path. Then `appliedGraphVersion` is persisted as `'0.2.0'`.
 *
 * UPGRADE FROM 0.2.0 → 0.2.1:
 *   `addition-within-20` and `unknown-as-missing-addend` gain real band ladders
 *   and registered generators — no node is added, split, merged, or renamed, so
 *   `GRAPH_MIGRATIONS['0.2.0']` is also `[]` (no-op). Same fast path as above.
 *
 * NO-CHANGE RUN:
 *   If `appliedGraphVersion === graph.graphVersion`, reconciliation is skipped entirely
 *   (no ops lookup, no `applyGraphMigrations` call, no settings write). This is the
 *   common case on every app launch after the first install.
 *
 * FUTURE OPS:
 *   When a new `graphVersion` ships, add an entry to `GRAPH_MIGRATIONS` keyed by the
 *   PREVIOUS version. The value is an array of `GraphMigrationOp` values in application
 *   order. The mechanism is fully in place; today's empty ops lists are the no-op default.
 *
 * ANTI-SHAME:
 *   `applyGraphMigrations` (graph-migration-repository.ts) uses MAX guards to ensure
 *   mastery_level can never decrease as a result of a migration. This guarantee
 *   propagates through `reconcileGraphVersion` automatically.
 */

import type { GraphDefinition } from '@/core/types';
import {
  applyGraphMigrations,
  type GraphMigrationOp,
} from '@/repositories/graph-migration-repository';
import { settings } from '@/repositories/settings-repository';

// ---------------------------------------------------------------------------
// Graph-content migration map (config-as-data)
// ---------------------------------------------------------------------------

/**
 * GRAPH_MIGRATIONS — declarative ops map keyed by the FROM version.
 *
 * Shape: `{ [fromVersion: string]: GraphMigrationOp[] }`
 *
 * When reconciling from version A to version B:
 *   - Look up `GRAPH_MIGRATIONS[A]` → the list of ops that migrate A → B.
 *   - Call `applyGraphMigrations(ops)`.
 *
 * Entries:
 *   '0.1.0': [] — no-op. The 0.1.0 → 0.2.0 bump adds three new nodes
 *                  (number-bonds, multiplication, fraction-simplification).
 *                  No existing node is split, merged, or renamed, so no
 *                  node-identity migration ops are needed.
 *   '0.2.0': [] — no-op. The 0.2.0 → 0.2.1 bump gives `addition-within-20`
 *                  and `unknown-as-missing-addend` real band ladders and
 *                  registered generators. No node is added, split, merged, or
 *                  renamed, so no node-identity migration ops are needed.
 *
 * Example of a future non-trivial entry (when a node rename ships):
 *   '0.2.1': [{ op: 'rename', from: 'counting' as NodeId, to: 'number-sense' as NodeId }]
 *
 * This constant is exported so consumers (tests, CI checks) can assert the map
 * shape without importing private module internals.
 */
export const GRAPH_MIGRATIONS: Record<string, GraphMigrationOp[]> = {
  // No-op: 0.1.0 → 0.2.0 adds nodes only; no node-identity migration needed.
  '0.1.0': [],
  // No-op: 0.2.0 → 0.2.1 adds generators + band ladders only; no node-identity
  // migration needed.
  '0.2.0': [],
};

// ---------------------------------------------------------------------------
// reconcileGraphVersion
// ---------------------------------------------------------------------------

/**
 * reconcileGraphVersion(graph: GraphDefinition): Promise<void>
 *
 * Compares the asset's `graph.graphVersion` against the persisted
 * `appliedGraphVersion` settings key. If they differ, looks up the migration
 * ops for the current version in `GRAPH_MIGRATIONS`, runs them via
 * `applyGraphMigrations`, then persists the new version.
 *
 * INVARIANTS:
 *   - Schema migrations (`initDatabase`) MUST complete before this is called.
 *   - `settings.hydrate()` MUST complete before this is called (so that
 *     `settings.get('appliedGraphVersion')` returns the persisted value, not
 *     the default `''` from a cold-cache miss).
 *   - This function NEVER reads or writes `PRAGMA user_version`.
 *
 * SIDE EFFECTS:
 *   - Calls `applyGraphMigrations(ops)` (may write to the `progress` table).
 *   - Calls `settings.set('appliedGraphVersion', newVersion)` (writes to the
 *     `settings` table and updates the in-memory cache).
 *
 * @param graph - The loaded `GraphDefinition` asset (from `loadGraph()`).
 */
export async function reconcileGraphVersion(graph: GraphDefinition): Promise<void> {
  const persisted = settings.get('appliedGraphVersion');
  const assetVersion = graph.graphVersion;

  // No-change fast path: already up to date.
  if (persisted === assetVersion) {
    return;
  }

  // Look up ops for the current (persisted) version → new (asset) version.
  // If the persisted version has no entry in the map (including '' on first run),
  // default to an empty ops list (the documented no-op).
  const ops: GraphMigrationOp[] = GRAPH_MIGRATIONS[persisted] ?? [];

  // Apply the ops (may be empty → fast-path no-op in applyGraphMigrations).
  await applyGraphMigrations(ops);

  // Persist the new applied version via the settings seam.
  // NOT via PRAGMA user_version — the two axes must stay separate (DL-7).
  await settings.set('appliedGraphVersion', assetVersion);
}
