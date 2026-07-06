/**
 * Tests for the graph-migration applier (applyGraphMigrations).
 *
 * Completion criteria (Phase 5):
 *   (a) rename — carries mastery from source to target, retires source row.
 *   (b) split  — propagates source mastery to ALL children via max(); retires source.
 *   (c) merge  — target gets max() of all sources; all source rows retired.
 *   (d) deprecate — source row retired; no survivor mastery touched.
 *   (e) Anti-shame assertion — no op EVER decreases any node's mastery_level.
 *   (f) Empty ops list — no-op (no DB access, returns immediately).
 *   (g) Two version axes separated — PRAGMA user_version is never changed.
 *   (h) Split propagates to ALL children (not just first).
 *   (i) Merge: children with pre-existing mastery higher than source keep their level.
 *   (j) Rename: target with pre-existing mastery higher than source keeps its level.
 */

import { useTestDb, useRestartableTestDb } from '../../../jest.setup';
import { settings } from '../settings-repository';
import { applyGraphMigrations } from '../graph-migration-repository';
import { getProgress } from '../progress-repository';
import { readDurableSince } from '../events-repository';
import { getDb } from '../../db/database';

// Per-test in-memory DB isolation.
useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a progress row with a specific mastery level directly via SQL. */
async function seedProgress(nodeId: string, masteryLevel: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO progress (node_id, mastery_level, streak, xp, due_at, metrics, updated_at)
     VALUES (?, ?, 0, 0, NULL, '{}', ?)`,
    nodeId,
    masteryLevel,
    Date.now()
  );
}

/** Return current mastery_level for a node, or null if absent. */
async function getMastery(nodeId: string): Promise<number | null> {
  const row = await getProgress(nodeId);
  return row?.masteryLevel ?? null;
}

/** Return raw PRAGMA user_version to verify graph migrations never touch it. */
async function getDbSchemaVersion(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

// ---------------------------------------------------------------------------
// (f) Empty ops list → no-op
// ---------------------------------------------------------------------------

describe('applyGraphMigrations — empty ops', () => {
  it('returns immediately without touching the DB when ops is empty', async () => {
    await seedProgress('node-a', 2);
    const schemaBefore = await getDbSchemaVersion();

    await applyGraphMigrations([]);

    // Node unchanged.
    expect(await getMastery('node-a')).toBe(2);
    // DB schema version not touched.
    expect(await getDbSchemaVersion()).toBe(schemaBefore);
  });
});

// ---------------------------------------------------------------------------
// (a) rename
// ---------------------------------------------------------------------------

describe('applyGraphMigrations — rename', () => {
  it('carries mastery from source to new node and retires source', async () => {
    await seedProgress('old-node', 3);

    await applyGraphMigrations([{ op: 'rename', from: 'old-node', to: 'new-node' }]);

    expect(await getMastery('new-node')).toBe(3);
    expect(await getMastery('old-node')).toBeNull();
  });

  it('(j) when target already exists at higher mastery, keeps the higher value', async () => {
    await seedProgress('old-node', 2);
    await seedProgress('new-node', 5);

    await applyGraphMigrations([{ op: 'rename', from: 'old-node', to: 'new-node' }]);

    // target was already at 5, source was 2 — must not decrease
    expect(await getMastery('new-node')).toBe(5);
    expect(await getMastery('old-node')).toBeNull();
  });

  it('when target already exists at lower mastery, updates to source mastery', async () => {
    await seedProgress('old-node', 4);
    await seedProgress('new-node', 1);

    await applyGraphMigrations([{ op: 'rename', from: 'old-node', to: 'new-node' }]);

    expect(await getMastery('new-node')).toBe(4);
    expect(await getMastery('old-node')).toBeNull();
  });

  it('when source does not exist, target still gets created with mastery 0', async () => {
    // Source has no row → effective mastery is 0.
    await applyGraphMigrations([{ op: 'rename', from: 'ghost-node', to: 'new-node' }]);

    expect(await getMastery('new-node')).toBe(0);
    expect(await getMastery('ghost-node')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (b) split
// ---------------------------------------------------------------------------

describe('applyGraphMigrations — split', () => {
  it('propagates source mastery to ALL children and retires source', async () => {
    await seedProgress('parent', 4);

    await applyGraphMigrations([
      { op: 'split', from: 'parent', to: ['child-a', 'child-b', 'child-c'] },
    ]);

    // All children get at least the parent mastery.
    expect(await getMastery('child-a')).toBe(4);
    expect(await getMastery('child-b')).toBe(4);
    expect(await getMastery('child-c')).toBe(4);
    // Parent retired.
    expect(await getMastery('parent')).toBeNull();
  });

  it('(h) propagates to ALL children, not just the first', async () => {
    await seedProgress('src', 3);

    await applyGraphMigrations([
      { op: 'split', from: 'src', to: ['c1', 'c2', 'c3', 'c4'] },
    ]);

    expect(await getMastery('c1')).toBe(3);
    expect(await getMastery('c2')).toBe(3);
    expect(await getMastery('c3')).toBe(3);
    expect(await getMastery('c4')).toBe(3);
    expect(await getMastery('src')).toBeNull();
  });

  it('(i) child with pre-existing mastery higher than source keeps its level', async () => {
    await seedProgress('parent', 2);
    await seedProgress('child-a', 5); // already higher than parent
    await seedProgress('child-b', 1);

    await applyGraphMigrations([
      { op: 'split', from: 'parent', to: ['child-a', 'child-b'] },
    ]);

    // child-a was at 5, parent at 2 — child-a must not decrease
    expect(await getMastery('child-a')).toBe(5);
    // child-b was at 1, parent at 2 — child-b should increase to 2
    expect(await getMastery('child-b')).toBe(2);
    expect(await getMastery('parent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (c) merge
// ---------------------------------------------------------------------------

describe('applyGraphMigrations — merge', () => {
  it('target gets the max of all sources, sources are retired', async () => {
    await seedProgress('src-a', 3);
    await seedProgress('src-b', 5);
    await seedProgress('src-c', 2);

    await applyGraphMigrations([
      { op: 'merge', from: ['src-a', 'src-b', 'src-c'], to: 'merged' },
    ]);

    expect(await getMastery('merged')).toBe(5);
    expect(await getMastery('src-a')).toBeNull();
    expect(await getMastery('src-b')).toBeNull();
    expect(await getMastery('src-c')).toBeNull();
  });

  it('target with pre-existing higher mastery keeps its mastery', async () => {
    await seedProgress('src-a', 3);
    await seedProgress('src-b', 4);
    await seedProgress('merged', 7); // already higher than any source

    await applyGraphMigrations([
      { op: 'merge', from: ['src-a', 'src-b'], to: 'merged' },
    ]);

    // merged was at 7, max source was 4 — must not decrease
    expect(await getMastery('merged')).toBe(7);
    expect(await getMastery('src-a')).toBeNull();
    expect(await getMastery('src-b')).toBeNull();
  });

  it('target inherits max when it does not exist yet', async () => {
    await seedProgress('src-x', 6);

    await applyGraphMigrations([
      { op: 'merge', from: ['src-x'], to: 'new-merged' },
    ]);

    expect(await getMastery('new-merged')).toBe(6);
    expect(await getMastery('src-x')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (d) deprecate
// ---------------------------------------------------------------------------

describe('applyGraphMigrations — deprecate', () => {
  it('retires the source node and touches no other node', async () => {
    await seedProgress('deprecated-node', 5);
    await seedProgress('survivor-node', 3);

    await applyGraphMigrations([{ op: 'deprecate', from: 'deprecated-node' }]);

    expect(await getMastery('deprecated-node')).toBeNull();
    // Survivor is completely untouched.
    expect(await getMastery('survivor-node')).toBe(3);
  });

  it('is a no-op if the source node does not exist', async () => {
    await seedProgress('survivor', 2);

    await applyGraphMigrations([{ op: 'deprecate', from: 'ghost-to-deprecate' }]);

    expect(await getMastery('ghost-to-deprecate')).toBeNull();
    expect(await getMastery('survivor')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (e) Anti-shame assertion — no op ever decreases any node's mastery_level
// ---------------------------------------------------------------------------

describe('applyGraphMigrations — anti-shame invariant', () => {
  it('no operation decreases any surviving node mastery_level', async () => {
    // Set up a fixture with known mastery levels.
    await seedProgress('r-source', 4);
    await seedProgress('r-target', 6); // rename target already higher

    await seedProgress('s-source', 3);
    await seedProgress('s-child-a', 5); // split child already higher
    await seedProgress('s-child-b', 1);

    await seedProgress('m-src-1', 2);
    await seedProgress('m-src-2', 4);
    await seedProgress('m-target', 7); // merge target already higher

    await seedProgress('dep-node', 3);
    await seedProgress('dep-survivor', 8); // should not be touched

    // Record all survivings' mastery BEFORE.
    const beforeRename = await getMastery('r-target');
    const beforeSplitA = await getMastery('s-child-a');
    const beforeMergeTarget = await getMastery('m-target');
    const beforeSurvivor = await getMastery('dep-survivor');

    await applyGraphMigrations([
      { op: 'rename', from: 'r-source', to: 'r-target' },
      { op: 'split', from: 's-source', to: ['s-child-a', 's-child-b'] },
      { op: 'merge', from: ['m-src-1', 'm-src-2'], to: 'm-target' },
      { op: 'deprecate', from: 'dep-node' },
    ]);

    // Anti-shame: no survivor's mastery decreased.
    expect(await getMastery('r-target')).toBeGreaterThanOrEqual(beforeRename!);
    expect(await getMastery('s-child-a')).toBeGreaterThanOrEqual(beforeSplitA!);
    expect(await getMastery('s-child-b')).toBeGreaterThanOrEqual(0);
    expect(await getMastery('m-target')).toBeGreaterThanOrEqual(beforeMergeTarget!);
    expect(await getMastery('dep-survivor')).toBe(beforeSurvivor);
  });
});

// ---------------------------------------------------------------------------
// (g) Version axes — PRAGMA user_version not touched by graph migrations
// ---------------------------------------------------------------------------

describe('applyGraphMigrations — version axis separation', () => {
  it('never modifies PRAGMA user_version (DB-schema axis untouched)', async () => {
    await seedProgress('node-v', 2);
    const schemaBefore = await getDbSchemaVersion();

    await applyGraphMigrations([
      { op: 'rename', from: 'node-v', to: 'node-v-renamed' },
    ]);

    expect(await getDbSchemaVersion()).toBe(schemaBefore);
  });
});

// ---------------------------------------------------------------------------
// Multiple ops applied in order
// ---------------------------------------------------------------------------

describe('applyGraphMigrations — sequential ops', () => {
  it('applies multiple ops in array order', async () => {
    await seedProgress('a', 3);
    await seedProgress('b', 2);

    await applyGraphMigrations([
      { op: 'rename', from: 'a', to: 'a-new' },
      { op: 'split', from: 'b', to: ['b1', 'b2'] },
    ]);

    expect(await getMastery('a-new')).toBe(3);
    expect(await getMastery('a')).toBeNull();
    expect(await getMastery('b1')).toBe(2);
    expect(await getMastery('b2')).toBe(2);
    expect(await getMastery('b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 6 (stage 07) — durable-event silence + cold-restart durability
// (interruption point 7 of interview-brief.md's 7-point plan)
// ---------------------------------------------------------------------------
//
// graph-migration-repository.ts's own header documents "Graph migrations are
// silent data reshaping and do not emit durable events" — the tests above
// exercise every op's mastery-propagation shape but never assert the
// no-durable-events claim itself, nor that any of it survives a cold restart.
// This block closes both gaps, reusing the Phase-5 useRestartableTestDb()
// harness (jest.setup.ts) rather than re-deriving a second cold-restart
// mechanism.
describe('applyGraphMigrations — durable-event silence + cold-restart durability', () => {
  const { reopen } = useRestartableTestDb();

  beforeEach(async () => {
    // Re-hydrate against the NAMED db this block's useRestartableTestDb() just
    // swapped in (the outer file-level beforeEach above hydrated against the
    // now-discarded ':memory:' db from the outer useTestDb()).
    await settings.hydrate();
  });

  it('emits NO durable events for any op (rename/split/merge/deprecate are silent data reshaping)', async () => {
    await seedProgress('silent-r-src', 3);
    await seedProgress('silent-s-src', 2);
    await seedProgress('silent-m-src-1', 1);
    await seedProgress('silent-m-src-2', 4);
    await seedProgress('silent-dep', 5);

    expect(await readDurableSince(0)).toHaveLength(0);

    await applyGraphMigrations([
      { op: 'rename', from: 'silent-r-src', to: 'silent-r-dst' },
      { op: 'split', from: 'silent-s-src', to: ['silent-s-c1', 'silent-s-c2'] },
      { op: 'merge', from: ['silent-m-src-1', 'silent-m-src-2'], to: 'silent-m-dst' },
      { op: 'deprecate', from: 'silent-dep' },
    ]);

    // Still zero — the applier never touches durable_events (structurally,
    // per its own header doc — this is the runtime proof).
    expect(await readDurableSince(0)).toHaveLength(0);
  });

  it('mastery propagation, durable-event silence, and DB-schema-axis independence all survive a cold restart', async () => {
    await seedProgress('restart-r-src', 4);
    await seedProgress('restart-r-dst', 2); // pre-existing, lower than source

    await seedProgress('restart-s-src', 3);
    await seedProgress('restart-s-child-a', 6); // pre-existing, higher than source
    await seedProgress('restart-s-child-b', 1);

    const schemaBefore = await getDbSchemaVersion();

    await applyGraphMigrations([
      { op: 'rename', from: 'restart-r-src', to: 'restart-r-dst' },
      { op: 'split', from: 'restart-s-src', to: ['restart-s-child-a', 'restart-s-child-b'] },
    ]);

    // Simulate the process being killed right after the migrations commit,
    // then a cold restart — proves this isn't just an in-memory illusion.
    await reopen();
    await settings.hydrate();

    // Rename: target carries the max(existing, source) mastery; source retired.
    expect(await getMastery('restart-r-dst')).toBe(4);
    expect(await getMastery('restart-r-src')).toBeNull();

    // Split: pre-existing-higher child keeps its level; lower child rises to
    // the source's level. Neither is ever lowered.
    expect(await getMastery('restart-s-child-a')).toBe(6);
    expect(await getMastery('restart-s-child-b')).toBe(3);
    expect(await getMastery('restart-s-src')).toBeNull();

    // No durable events were ever emitted, and that silence survives restart.
    expect(await readDurableSince(0)).toHaveLength(0);

    // The two version axes stay independent — the DB-schema axis (PRAGMA
    // user_version) is completely untouched by graph-content-axis migrations,
    // including across a restart (a cold restart re-runs the idempotent
    // schema migration runner, which must not re-bump user_version either).
    expect(await getDbSchemaVersion()).toBe(schemaBefore);
  });
});
