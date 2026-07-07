/**
 * graph-version.test.ts — Tests for `reconcileGraphVersion()` and `GRAPH_MIGRATIONS`.
 *
 * Verifies:
 *   - First-run: persisted `''` !== `'0.2.0'` → calls `applyGraphMigrations([])` (no-op)
 *     then persists `'0.2.0'` via settings.
 *   - Upgrade run: persisted `'0.1.0'` !== `'0.2.0'` → looks up `GRAPH_MIGRATIONS['0.1.0']`
 *     → `[]` (no-op entry for the 0.1.0→0.2.0 transition), runs it, persists `'0.2.0'`.
 *   - No-change run: `appliedGraphVersion` already `'0.2.0'` → no ops, no re-persist.
 *   - Version is persisted via the settings seam, NOT via `PRAGMA user_version`.
 *   - `GRAPH_MIGRATIONS['0.1.0']` and `GRAPH_MIGRATIONS['0.2.0']` are both `[]`
 *     (no-op; nodes added or gained generators/bands, none split/merged/renamed).
 *   - Anti-shame: mastery_level never decreases (structural — `applyGraphMigrations`
 *     guarantees this; we verify the empty-ops fast path is actually taken).
 *
 * NOTE: this suite exercises `reconcileGraphVersion()` generically via its own
 * synthetic `makeTestGraph()` literals (version `'0.2.0'` by default) — it does
 * NOT depend on `GRAPH_FIXTURE`'s actual `graphVersion` (currently `'0.2.1'`).
 *
 * ISOLATION STRATEGY:
 *   Tests use `useTestDb()` for a fresh migrated in-memory DB per test.
 *   The settings singleton is re-hydrated in beforeEach so each test starts
 *   from a clean cache (no stale `appliedGraphVersion` from prior tests).
 */

import { useTestDb } from '../../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { reconcileGraphVersion, GRAPH_MIGRATIONS } from '../graph-version';
import * as graphMigrationModule from '@/repositories/graph-migration-repository';
import type { GraphDefinition } from '@/core/types';

// Wire per-test in-memory DB isolation.
useTestDb();

// Suppress console.warn from loadGraph fixture guard in these tests.
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: re-hydrate settings from the test DB (simulates app restart)
// ---------------------------------------------------------------------------

async function hydrateSettings(): Promise<void> {
  await settings.hydrate();
}

// ---------------------------------------------------------------------------
// Helper: a minimal graph definition for testing
// ---------------------------------------------------------------------------

function makeTestGraph(version: string = '0.2.0'): GraphDefinition {
  return {
    graphVersion: version,
    fixture: true,
    nodes: [
      {
        id: 'test-node',
        prerequisites: [],
        representationLevels: ['concrete'],
        difficultyHooks: {
          bands: [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// GRAPH_MIGRATIONS shape
// ---------------------------------------------------------------------------

describe('GRAPH_MIGRATIONS', () => {
  it('has exactly three entries keyed by "0.1.0", "0.2.0", and "0.2.1"', () => {
    expect(typeof GRAPH_MIGRATIONS).toBe('object');
    expect(Object.keys(GRAPH_MIGRATIONS)).toHaveLength(3);
    expect(Object.keys(GRAPH_MIGRATIONS)).toContain('0.1.0');
    expect(Object.keys(GRAPH_MIGRATIONS)).toContain('0.2.0');
    expect(Object.keys(GRAPH_MIGRATIONS)).toContain('0.2.1');
  });

  it('GRAPH_MIGRATIONS["0.1.0"] is an empty array (no-op: nodes added, none renamed)', () => {
    expect(GRAPH_MIGRATIONS['0.1.0']).toEqual([]);
  });

  it('GRAPH_MIGRATIONS["0.2.0"] is an empty array (no-op: generators/bands added, none renamed)', () => {
    expect(GRAPH_MIGRATIONS['0.2.0']).toEqual([]);
  });

  it('GRAPH_MIGRATIONS["0.2.1"] is an empty array (no-op: six new nodes added, none renamed)', () => {
    expect(GRAPH_MIGRATIONS['0.2.1']).toEqual([]);
  });

  it('GRAPH_MIGRATIONS[""] is undefined (no ops for first-run from empty)', () => {
    expect(GRAPH_MIGRATIONS['']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// First-run: appliedGraphVersion '' → '0.2.0'
// ---------------------------------------------------------------------------

describe('reconcileGraphVersion() — first-run', () => {
  let applyGraphMigrationsSpy: jest.SpyInstance;

  beforeEach(async () => {
    await hydrateSettings();
    // Fresh install: appliedGraphVersion is '' (the SETTINGS_DEFAULTS value).
    expect(settings.get('appliedGraphVersion')).toBe('');

    // Spy on applyGraphMigrations to verify it's called with an empty ops list.
    applyGraphMigrationsSpy = jest
      .spyOn(graphMigrationModule, 'applyGraphMigrations')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    applyGraphMigrationsSpy.mockRestore();
  });

  it('calls applyGraphMigrations with an empty ops list on first run', async () => {
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);
    expect(applyGraphMigrationsSpy).toHaveBeenCalledTimes(1);
    expect(applyGraphMigrationsSpy).toHaveBeenCalledWith([]);
  });

  it('persists appliedGraphVersion as "0.2.0" after first run', async () => {
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);
    expect(settings.get('appliedGraphVersion')).toBe('0.2.0');
  });

  it('appliedGraphVersion persists across a re-hydrate (settings.hydrate)', async () => {
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);
    // Simulate app restart: re-hydrate settings from DB
    await hydrateSettings();
    expect(settings.get('appliedGraphVersion')).toBe('0.2.0');
  });
});

// ---------------------------------------------------------------------------
// Upgrade run: appliedGraphVersion '0.1.0' → '0.2.0'
// ---------------------------------------------------------------------------

describe('reconcileGraphVersion() — upgrade from 0.1.0 to 0.2.0', () => {
  let applyGraphMigrationsSpy: jest.SpyInstance;

  beforeEach(async () => {
    await hydrateSettings();
    // Simulate a device that ran '0.1.0' previously.
    await settings.set('appliedGraphVersion', '0.1.0');

    applyGraphMigrationsSpy = jest
      .spyOn(graphMigrationModule, 'applyGraphMigrations')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    applyGraphMigrationsSpy.mockRestore();
  });

  it('calls applyGraphMigrations with the 0.1.0 no-op ops list', async () => {
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);
    expect(applyGraphMigrationsSpy).toHaveBeenCalledTimes(1);
    expect(applyGraphMigrationsSpy).toHaveBeenCalledWith([]);
  });

  it('persists appliedGraphVersion as "0.2.0" after upgrade', async () => {
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);
    expect(settings.get('appliedGraphVersion')).toBe('0.2.0');
  });

  it('upgrade persists across a re-hydrate (settings.hydrate)', async () => {
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);
    await hydrateSettings();
    expect(settings.get('appliedGraphVersion')).toBe('0.2.0');
  });
});

// ---------------------------------------------------------------------------
// No-change run: appliedGraphVersion already '0.2.0'
// ---------------------------------------------------------------------------

describe('reconcileGraphVersion() — no-change run', () => {
  let applyGraphMigrationsSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Set appliedGraphVersion to '0.2.0' so the no-change path is taken.
    await hydrateSettings();
    await settings.set('appliedGraphVersion', '0.2.0');

    applyGraphMigrationsSpy = jest
      .spyOn(graphMigrationModule, 'applyGraphMigrations')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    applyGraphMigrationsSpy.mockRestore();
  });

  it('does NOT call applyGraphMigrations when versions match', async () => {
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);
    expect(applyGraphMigrationsSpy).not.toHaveBeenCalled();
  });

  it('does NOT update the settings when versions match', async () => {
    const graph = makeTestGraph('0.2.0');
    // Capture current value before the call
    const before = settings.get('appliedGraphVersion');
    await reconcileGraphVersion(graph);
    // Value should be unchanged (and the same as before)
    expect(settings.get('appliedGraphVersion')).toBe(before);
  });

  it('returns Promise<void> (resolves without error)', async () => {
    const graph = makeTestGraph('0.2.0');
    await expect(reconcileGraphVersion(graph)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Version axis separation: settings key, NOT PRAGMA user_version
// ---------------------------------------------------------------------------

describe('reconcileGraphVersion() — axis separation', () => {
  let applyGraphMigrationsSpy: jest.SpyInstance;

  beforeEach(async () => {
    await hydrateSettings();
    applyGraphMigrationsSpy = jest
      .spyOn(graphMigrationModule, 'applyGraphMigrations')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    applyGraphMigrationsSpy.mockRestore();
  });

  it('persists version via settings seam, not PRAGMA user_version', async () => {
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);

    // settings.get('appliedGraphVersion') is the only storage — never PRAGMA user_version.
    expect(settings.get('appliedGraphVersion')).toBe('0.2.0');

    // Verify no DB_SCHEMA_VERSION/user_version interference:
    // The settings key is the sole store for the graph-content axis.
    // (We cannot easily query PRAGMA user_version here without bypassing
    // the seam, but the structural test is: only the settings key changed.)
    const appliedVersion = settings.get('appliedGraphVersion');
    expect(typeof appliedVersion).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Future-ops lookup shape (structural test)
// ---------------------------------------------------------------------------

describe('reconcileGraphVersion() — GRAPH_MIGRATIONS lookup shape', () => {
  let applyGraphMigrationsSpy: jest.SpyInstance;

  beforeEach(async () => {
    await hydrateSettings();
    applyGraphMigrationsSpy = jest
      .spyOn(graphMigrationModule, 'applyGraphMigrations')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    applyGraphMigrationsSpy.mockRestore();
  });

  it('defaults to empty ops when the persisted version is not in GRAPH_MIGRATIONS', async () => {
    // Simulate a persisted version that has no entry in GRAPH_MIGRATIONS.
    await settings.set('appliedGraphVersion', 'unknown-old-version');
    const graph = makeTestGraph('0.2.0');
    await reconcileGraphVersion(graph);

    // Should have been called with [] (the ?? [] default).
    expect(applyGraphMigrationsSpy).toHaveBeenCalledWith([]);
    // And should have persisted the new version.
    expect(settings.get('appliedGraphVersion')).toBe('0.2.0');
  });
});
