/**
 * Tests for the backup repository (Phase 6).
 *
 * Completion criteria:
 *   (a) Round-trip — export then import into a fresh DB restores materialized
 *       progress + durable events + settings identically.
 *   (b) Firehose excluded by default; included with includeFirehose flag.
 *   (c) Pre-import auto-backup is taken before the destructive replace.
 *   (d) Newer-than-app backup is REFUSED (no mutation occurs).
 *   (e) Older backup (schema version < current) is migrated forward then applied.
 *   (f) Import is atomic — injected mid-import failure leaves prior DB intact.
 *   (g) Settings restored correctly on round-trip.
 *   (h) Milestone invariant holds on restore (atomic milestone re-insert).
 */

// ---------------------------------------------------------------------------
// Mock setup — must come before any imports from the module under test
// ---------------------------------------------------------------------------

// In-memory FS store shared between mock and tests.
// Prefixed with 'mock' to satisfy Jest's out-of-scope variable rule for factory functions.
const mockFsStore = new Map<string, string>();
let mockShareCallCount = 0;
let mockLastSharedUri: string | null = null;

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test-app-storage/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mock setup)
// ---------------------------------------------------------------------------

import { useTestDb, useRestartableTestDb } from '../../../jest.setup';
import { settings } from '../settings-repository';
import { recordMilestone } from '../milestone-gate';
import { appendFirehose, readAllFirehose, readDurableSince } from '../events-repository';
import { upsertNonMilestoneProgress, getProgress } from '../progress-repository';
import { getDb } from '../../db/database';
import {
  exportBackup,
  importBackup,
  BackupTooNewError,
  type BackupPayload,
} from '../backup-repository';
import { DB_SCHEMA_VERSION } from '../../db/types';

// ---------------------------------------------------------------------------
// Per-test isolation
// ---------------------------------------------------------------------------

useTestDb();

beforeEach(async () => {
  // Reset mock FS state
  mockFsStore.clear();
  mockShareCallCount = 0;
  mockLastSharedUri = null;

  // Install mock implementations (must re-install after clearAllMocks)
  const FileSystem = jest.requireMock('expo-file-system/legacy');
  const Sharing = jest.requireMock('expo-sharing');
  jest.clearAllMocks();

  FileSystem.writeAsStringAsync.mockImplementation(async (uri: string, content: string) => {
    mockFsStore.set(uri, content);
  });
  FileSystem.readAsStringAsync.mockImplementation(async (uri: string) => {
    if (!mockFsStore.has(uri)) throw new Error(`mock FS: file not found: ${uri}`);
    return mockFsStore.get(uri);
  });
  FileSystem.deleteAsync.mockImplementation(async (uri: string) => {
    mockFsStore.delete(uri);
  });
  FileSystem.getInfoAsync.mockImplementation(async (uri: string) => ({
    exists: mockFsStore.has(uri),
    isDirectory: false,
    size: 0,
    modificationTime: 0,
    uri,
  }));
  Sharing.isAvailableAsync.mockImplementation(async () => true);
  Sharing.shareAsync.mockImplementation(async (uri: string) => {
    mockShareCallCount += 1;
    mockLastSharedUri = uri;
  });

  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a non-trivial DB state for round-trip tests. */
async function seedState() {
  await upsertNonMilestoneProgress({
    nodeId: 'node-alpha',
    streak: 3,
    xp: 120,
    metrics: JSON.stringify({ attempts: 5 }),
  });
  await recordMilestone({ kind: 'first_node_mastered', nodeId: 'node-alpha' });
  await appendFirehose('attempt', { nodeId: 'node-alpha', correct: true });
  await settings.set('uiLanguage', 'en');
}

/** Get the first non-pre-import file from the mock FS store. */
function getExportedJson(): string {
  for (const [key, value] of mockFsStore.entries()) {
    if (!key.includes('pre-import')) return value;
  }
  throw new Error('No exported backup file found in mock FS store');
}

/** Count rows in a table. */
async function countRows(table: string): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) as n FROM ${table}`);
  return row?.n ?? 0;
}

/** Read all progress rows from the DB (raw, for comparison). */
async function readAllProgress() {
  const db = getDb();
  return db.getAllAsync<{ node_id: string; mastery_level: number; streak: number; xp: number }>(
    'SELECT node_id, mastery_level, streak, xp FROM progress ORDER BY node_id ASC'
  );
}

/** Read raw settings from the DB. */
async function readRawSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings ORDER BY key ASC'
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ---------------------------------------------------------------------------
// (a) Round-trip — export → import → state is restored identically
// ---------------------------------------------------------------------------

describe('backup round-trip', () => {
  it('restores progress + durable events + settings after import', async () => {
    await seedState();

    const preProgress = await readAllProgress();
    const preDurable = await readDurableSince(0);
    const preSettings = await readRawSettings();

    await exportBackup();

    const exportedJson = getExportedJson();

    // Wipe the DB to simulate a fresh install
    const db = getDb();
    await db.execAsync('DELETE FROM progress');
    await db.execAsync('DELETE FROM durable_events');
    await db.execAsync('DELETE FROM settings');
    await db.execAsync('DELETE FROM firehose_events');

    await importBackup(exportedJson);
    await settings.hydrate();

    const postProgress = await readAllProgress();
    expect(postProgress).toHaveLength(preProgress.length);
    for (let i = 0; i < preProgress.length; i++) {
      expect(postProgress[i].node_id).toBe(preProgress[i].node_id);
      expect(postProgress[i].mastery_level).toBe(preProgress[i].mastery_level);
      expect(postProgress[i].streak).toBe(preProgress[i].streak);
      expect(postProgress[i].xp).toBe(preProgress[i].xp);
    }

    const postDurable = await readDurableSince(0);
    expect(postDurable).toHaveLength(preDurable.length);
    for (let i = 0; i < preDurable.length; i++) {
      expect(postDurable[i].kind).toBe(preDurable[i].kind);
      expect(postDurable[i].seq).toBe(preDurable[i].seq);
    }

    const postSettings = await readRawSettings();
    for (const key of Object.keys(preSettings)) {
      expect(postSettings[key]).toBe(preSettings[key]);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) Firehose excluded by default; included with flag
// ---------------------------------------------------------------------------

describe('firehose inclusion/exclusion', () => {
  it('excludes firehose by default', async () => {
    await appendFirehose('test-event', { x: 1 });
    await exportBackup();

    const payload = JSON.parse(getExportedJson()) as BackupPayload;
    expect(payload.firehose).toBeUndefined();
  });

  it('includes firehose when includeFirehose is true', async () => {
    await appendFirehose('test-event', { x: 1 });
    await appendFirehose('test-event-2', { y: 2 });
    await exportBackup({ includeFirehose: true });

    const payload = JSON.parse(getExportedJson()) as BackupPayload;
    expect(payload.firehose).toBeDefined();
    expect(payload.firehose!.length).toBe(2);
    expect(payload.firehose![0].type).toBe('test-event');
    expect(payload.firehose![1].type).toBe('test-event-2');
  });

  it('restores firehose rows when present in payload', async () => {
    await appendFirehose('firehose-restore', { z: 3 });
    await exportBackup({ includeFirehose: true });

    const exportedJson = getExportedJson();

    const db = getDb();
    await db.execAsync('DELETE FROM progress');
    await db.execAsync('DELETE FROM durable_events');
    await db.execAsync('DELETE FROM settings');
    await db.execAsync('DELETE FROM firehose_events');

    await importBackup(exportedJson);

    const firehose = await readAllFirehose();
    expect(firehose.length).toBe(1);
    expect(firehose[0].type).toBe('firehose-restore');
  });

  it('leaves firehose_events untouched when payload has no firehose key', async () => {
    // Seed firehose
    await appendFirehose('pre-existing', { a: 1 });

    // Export WITHOUT firehose (no firehose key in payload)
    await exportBackup({ includeFirehose: false });
    const exportedJson = getExportedJson();

    const payload = JSON.parse(exportedJson) as BackupPayload;
    expect(payload.firehose).toBeUndefined();

    // Import: firehose_events is NOT wiped (key absent → no wipe branch)
    await importBackup(exportedJson);
    const firehose = await readAllFirehose();
    expect(firehose.length).toBe(1);
    expect(firehose[0].type).toBe('pre-existing');
  });
});

// ---------------------------------------------------------------------------
// (c) Pre-import auto-backup is taken before destructive replace
// ---------------------------------------------------------------------------

describe('pre-import auto-backup', () => {
  it('writes a pre-import backup file before performing the full-replace', async () => {
    const validPayload: BackupPayload = {
      appVersion: '1.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: DB_SCHEMA_VERSION,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [],
      durableEvents: [],
      settings: {},
    };

    await importBackup(JSON.stringify(validPayload));

    const preImportFiles = [...mockFsStore.keys()].filter((k) => k.includes('pre-import'));
    expect(preImportFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('pre-import backup contains the pre-replace state', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'backup-proof-node' });

    const validPayload: BackupPayload = {
      appVersion: '1.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: DB_SCHEMA_VERSION,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [],
      durableEvents: [],
      settings: {},
    };

    await importBackup(JSON.stringify(validPayload));

    const preImportKey = [...mockFsStore.keys()].find((k) => k.includes('pre-import'));
    expect(preImportKey).toBeDefined();

    const preImportJson = mockFsStore.get(preImportKey!);
    const preImportPayload = JSON.parse(preImportJson!) as BackupPayload;

    const node = preImportPayload.progress.find((p) => p.nodeId === 'backup-proof-node');
    expect(node).toBeDefined();
    expect(node!.masteryLevel).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (d) Newer-than-app backup is REFUSED without mutation
// ---------------------------------------------------------------------------

describe('version gating — newer-than-app', () => {
  it('throws BackupTooNewError when backup schema version > app schema version', async () => {
    const newerPayload: BackupPayload = {
      appVersion: '99.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: DB_SCHEMA_VERSION + 100,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [
        {
          nodeId: 'should-not-appear',
          masteryLevel: 5,
          streak: 0,
          xp: 0,
          dueAt: null,
          metrics: '{}',
          updatedAt: Date.now(),
        },
      ],
      durableEvents: [],
      settings: {},
    };

    await expect(importBackup(JSON.stringify(newerPayload))).rejects.toThrow(BackupTooNewError);
  });

  it('does NOT mutate the DB when refusing a too-new backup', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'guarded-node', streak: 7, xp: 200 });
    const preProgressCount = await countRows('progress');

    const newerPayload: BackupPayload = {
      appVersion: '99.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: DB_SCHEMA_VERSION + 1,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [],
      durableEvents: [],
      settings: {},
    };

    // Assert the refusal explicitly: importBackup MUST reject with BackupTooNewError.
    // A bare try/catch would silently pass if the import never threw — this form
    // fails the test if no rejection occurs.
    await expect(importBackup(JSON.stringify(newerPayload))).rejects.toBeInstanceOf(
      BackupTooNewError
    );

    expect(await countRows('progress')).toBe(preProgressCount);
    const node = await getProgress('guarded-node');
    expect(node).not.toBeNull();
    expect(node!.streak).toBe(7);
  });

  it('BackupTooNewError carries the version numbers', async () => {
    const backupVersion = DB_SCHEMA_VERSION + 5;
    const payload: BackupPayload = {
      appVersion: '99.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: backupVersion,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [],
      durableEvents: [],
      settings: {},
    };

    let caught: unknown;
    try {
      await importBackup(JSON.stringify(payload));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BackupTooNewError);
    const error = caught as BackupTooNewError;
    expect(error.backupSchemaVersion).toBe(backupVersion);
    expect(error.appSchemaVersion).toBe(DB_SCHEMA_VERSION);
  });
});

// ---------------------------------------------------------------------------
// (e) Older backup (schema version < current) is accepted and applied
// ---------------------------------------------------------------------------

describe('version gating — older backup', () => {
  it('accepts a backup with schema version < current and applies it', async () => {
    const olderPayload: BackupPayload = {
      appVersion: '0.1.0',
      exportFormatVersion: 1,
      appSchemaVersion: 0, // older than current (1)
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [
        {
          nodeId: 'old-node',
          masteryLevel: 2,
          streak: 5,
          xp: 100,
          dueAt: null,
          metrics: '{}',
          updatedAt: Date.now(),
        },
      ],
      durableEvents: [],
      settings: { uiLanguage: JSON.stringify('fr') },
    };

    await importBackup(JSON.stringify(olderPayload));
    await settings.hydrate();

    const node = await getProgress('old-node');
    expect(node).not.toBeNull();
    expect(node!.masteryLevel).toBe(2);
    expect(node!.streak).toBe(5);
    expect(settings.get('uiLanguage')).toBe('fr');
  });
});

// ---------------------------------------------------------------------------
// (f) Import is atomic — injected failure leaves prior DB intact
// ---------------------------------------------------------------------------

describe('import atomicity', () => {
  it('rolls back on injected mid-import failure, leaving prior DB intact', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'survivor', streak: 9, xp: 99 });

    const attackPayload: BackupPayload = {
      appVersion: '1.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: DB_SCHEMA_VERSION,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [
        {
          nodeId: 'injected-node',
          masteryLevel: 1,
          streak: 0,
          xp: 0,
          dueAt: null,
          metrics: '{}',
          updatedAt: Date.now(),
        },
      ],
      durableEvents: [],
      settings: {},
    };

    // Inject: throw on first INSERT INTO progress inside the tx
    const db = getDb() as any;
    const original = db.runAsync.bind(db);
    let firstInsertIntercept = false;
    db.runAsync = async (sql: string, ...args: any[]) => {
      if (
        !firstInsertIntercept &&
        typeof sql === 'string' &&
        /insert\s+(or\s+\w+\s+)?into\s+progress\b/i.test(sql)
      ) {
        firstInsertIntercept = true;
        throw new Error('INJECTED: simulating mid-import progress insert failure');
      }
      return original(sql, ...args);
    };

    let caught: Error | null = null;
    try {
      await importBackup(JSON.stringify(attackPayload));
    } catch (err) {
      caught = err as Error;
    } finally {
      db.runAsync = original;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('INJECTED');

    // Survivor should be intact (rollback preserved it)
    const postSurvivor = await getProgress('survivor');
    expect(postSurvivor).not.toBeNull();
    expect(postSurvivor!.streak).toBe(9);

    // Injected node should NOT have been inserted
    const injected = await getProgress('injected-node');
    expect(injected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

describe('payload validation', () => {
  it('throws on invalid JSON', async () => {
    await expect(importBackup('not valid json{{')).rejects.toThrow(/could not be parsed/i);
  });

  it('throws when appSchemaVersion is missing', async () => {
    const bad = { exportFormatVersion: 1, progress: [], durableEvents: [], settings: {} };
    await expect(importBackup(JSON.stringify(bad))).rejects.toThrow(/appSchemaVersion/i);
  });

  it('throws when progress array is missing', async () => {
    const bad = {
      appSchemaVersion: DB_SCHEMA_VERSION,
      exportFormatVersion: 1,
      durableEvents: [],
      settings: {},
    };
    await expect(importBackup(JSON.stringify(bad))).rejects.toThrow(/progress/i);
  });

  it('throws when durableEvents array is missing', async () => {
    const bad = {
      appSchemaVersion: DB_SCHEMA_VERSION,
      exportFormatVersion: 1,
      progress: [],
      settings: {},
    };
    await expect(importBackup(JSON.stringify(bad))).rejects.toThrow(/durableEvents/i);
  });
});

// ---------------------------------------------------------------------------
// Export payload stamps
// ---------------------------------------------------------------------------

describe('export payload stamps', () => {
  it('stamps appSchemaVersion = DB_SCHEMA_VERSION', async () => {
    await exportBackup();
    const payload = JSON.parse(getExportedJson()) as BackupPayload;
    expect(payload.appSchemaVersion).toBe(DB_SCHEMA_VERSION);
  });

  it('stamps graphVersion as null in stage 01 (no graph loaded)', async () => {
    await exportBackup();
    const payload = JSON.parse(getExportedJson()) as BackupPayload;
    expect(payload.graphVersion).toBeNull();
  });

  it('stamps exportFormatVersion = 1', async () => {
    await exportBackup();
    const payload = JSON.parse(getExportedJson()) as BackupPayload;
    expect(payload.exportFormatVersion).toBe(1);
  });

  it('stamps exportedAt as a recent epoch ms', async () => {
    const before = Date.now();
    await exportBackup();
    const after = Date.now();
    const payload = JSON.parse(getExportedJson()) as BackupPayload;
    expect(payload.exportedAt).toBeGreaterThanOrEqual(before);
    expect(payload.exportedAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// Export transport
// ---------------------------------------------------------------------------

describe('export transport', () => {
  it('calls expo-sharing.shareAsync after writing the file', async () => {
    await exportBackup();
    expect(mockShareCallCount).toBe(1);
    expect(mockLastSharedUri).toMatch(/tyama-backup-/);
  });

  it('returns the URI of the written file', async () => {
    const uri = await exportBackup();
    expect(typeof uri).toBe('string');
    expect(uri).toContain('tyama-backup-');
  });
});

// ---------------------------------------------------------------------------
// (h) Milestone invariant on restore
// ---------------------------------------------------------------------------

describe('milestone invariant on restore', () => {
  it('durable event and progress mastery_level are re-inserted atomically on restore', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'milestone-restore-node' });

    const preDurable = await readDurableSince(0);
    const preProgress = await getProgress('milestone-restore-node');
    expect(preDurable).toHaveLength(1);
    expect(preProgress!.masteryLevel).toBe(1);

    await exportBackup();
    const exportedJson = getExportedJson();

    const db = getDb();
    await db.execAsync('DELETE FROM progress');
    await db.execAsync('DELETE FROM durable_events');
    await db.execAsync('DELETE FROM settings');

    await importBackup(exportedJson);

    const postProgress = await getProgress('milestone-restore-node');
    const postDurable = await readDurableSince(0);

    expect(postProgress).not.toBeNull();
    expect(postProgress!.masteryLevel).toBe(1);
    expect(postDurable).toHaveLength(1);
    expect(postDurable[0].kind).toBe('first_node_mastered');
  });
});

// ---------------------------------------------------------------------------
// Phase 6 (stage 07) — cold-restart durability (interruption points 5-6)
// ---------------------------------------------------------------------------
//
// Every test above proves atomicity/version-gating within the SAME process
// (useTestDb()'s ':memory:' DB, wiped on close). This block additionally
// proves the SAME invariants survive a simulated cold restart (process
// killed, app relaunched) by reusing the Phase-5 useRestartableTestDb()
// harness (jest.setup.ts) rather than re-deriving a second mechanism —
// its close()+reopen()-by-name behaviour (backed by __mocks__/expo-sqlite.js's
// savedImages map) is exactly what "the DB survives a kill" means at the unit
// layer; a real OS-level process kill remains the device matrix's job.
//
// NESTING NOTE: useRestartableTestDb() registers its own beforeEach/afterEach
// scoped to THIS describe block only (Jest scopes hooks registered inside a
// describe callback to that block). Its beforeEach runs AFTER the file-level
// useTestDb() + mock-FS/settings.hydrate() beforeEach above, swapping the
// active DB singleton to a NAMED, restart-capable database for every test in
// this block; its afterEach runs BEFORE the file-level afterEach, so the named
// DB is torn down first and the outer ':memory:' teardown is a harmless no-op
// on an already-unused handle.
describe('Phase 6 — cold-restart durability (points 5-6)', () => {
  const { reopen } = useRestartableTestDb();

  beforeEach(async () => {
    // Re-hydrate against the NAMED db this block's useRestartableTestDb() just
    // swapped in (the outer beforeEach above hydrated against the now-discarded
    // ':memory:' db from the outer useTestDb()).
    await settings.hydrate();
  });

  it('Point 5 — import-crash rollback survives a cold restart (rolled-back node stays absent, survivor stays intact)', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'restart-survivor', streak: 4, xp: 40 });

    const attackPayload: BackupPayload = {
      appVersion: '1.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: DB_SCHEMA_VERSION,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [
        {
          nodeId: 'restart-injected-node',
          masteryLevel: 1,
          streak: 0,
          xp: 0,
          dueAt: null,
          metrics: '{}',
          updatedAt: Date.now(),
        },
      ],
      durableEvents: [],
      settings: {},
    };

    // Inject: throw on first INSERT INTO progress inside the import tx.
    const db = getDb() as any;
    const original = db.runAsync.bind(db);
    let intercepted = false;
    db.runAsync = async (sql: string, ...args: any[]) => {
      if (
        !intercepted &&
        typeof sql === 'string' &&
        /insert\s+(or\s+\w+\s+)?into\s+progress\b/i.test(sql)
      ) {
        intercepted = true;
        throw new Error('INJECTED: simulating mid-import progress insert failure');
      }
      return original(sql, ...args);
    };

    try {
      await expect(importBackup(JSON.stringify(attackPayload))).rejects.toThrow('INJECTED');
    } finally {
      db.runAsync = original;
    }

    // Simulate the process being killed right after the rollback, then cold-restart.
    await reopen();
    await settings.hydrate();

    const survivor = await getProgress('restart-survivor');
    expect(survivor).not.toBeNull();
    expect(survivor!.streak).toBe(4);

    const injected = await getProgress('restart-injected-node');
    expect(injected).toBeNull();
  });

  it('Point 5 — BackupTooNewError refuses with zero mutation, and that holds across a cold restart', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'guarded-restart-node', streak: 11, xp: 300 });
    const before = await countRows('progress');

    const newerPayload: BackupPayload = {
      appVersion: '99.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: DB_SCHEMA_VERSION + 3,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [],
      durableEvents: [],
      settings: {},
    };

    await expect(importBackup(JSON.stringify(newerPayload))).rejects.toBeInstanceOf(
      BackupTooNewError
    );

    // Simulate the process being killed right after the refusal, then cold-restart.
    await reopen();
    await settings.hydrate();

    expect(await countRows('progress')).toBe(before);
    const node = await getProgress('guarded-restart-node');
    expect(node).not.toBeNull();
    expect(node!.streak).toBe(11);
  });

  it('Point 5 — the pre-import auto-backup is written before the destructive replace, and the DB itself reflects the post-replace state after a cold restart', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'pre-import-restart-node' });

    const emptyPayload: BackupPayload = {
      appVersion: '1.0.0',
      exportFormatVersion: 1,
      appSchemaVersion: DB_SCHEMA_VERSION,
      graphVersion: null,
      exportedAt: Date.now(),
      progress: [],
      durableEvents: [],
      settings: {},
    };

    await importBackup(JSON.stringify(emptyPayload));

    // The pre-import auto-backup (written BEFORE the destructive replace)
    // captured the pre-replace state — proves the safety net fired first.
    const preImportKey = [...mockFsStore.keys()].find((k) => k.includes('pre-import'));
    expect(preImportKey).toBeDefined();
    const preImportPayload = JSON.parse(mockFsStore.get(preImportKey!)!) as BackupPayload;
    const backedUpNode = preImportPayload.progress.find(
      (p) => p.nodeId === 'pre-import-restart-node'
    );
    expect(backedUpNode).toBeDefined();
    expect(backedUpNode!.masteryLevel).toBe(1);

    // Cold-restart: the live DB reflects the POST-replace (empty) state — the
    // auto-backup is a recovery FILE, not a silent second copy of live state.
    await reopen();
    const postRestart = await getProgress('pre-import-restart-node');
    expect(postRestart).toBeNull();
  });

  it('Point 6 — round-trip protects a non-zero streak across a cold restart (north-star: never subtracted)', async () => {
    await upsertNonMilestoneProgress({ nodeId: 'streak-restart-node', streak: 9, xp: 450 });
    await settings.set('uiLanguage', 'en');

    await exportBackup();
    const exportedJson = getExportedJson();

    const db = getDb();
    await db.execAsync('DELETE FROM progress');
    await db.execAsync('DELETE FROM durable_events');
    await db.execAsync('DELETE FROM settings');

    await importBackup(exportedJson);

    // Simulate the process dying right after the restore commits, then cold-restart.
    await reopen();
    await settings.hydrate();

    const restored = await getProgress('streak-restart-node');
    expect(restored).not.toBeNull();
    expect(restored!.streak).toBe(9);
    expect(settings.get('uiLanguage')).toBe('en');
  });

  it('Point 6 — round-trip never lowers mastery_level; the restored value equals exactly what was exported, and holds across a cold restart', async () => {
    await recordMilestone({ kind: 'first_node_mastered', nodeId: 'mastery-floor-restart-node' });
    const preMastery = (await getProgress('mastery-floor-restart-node'))!.masteryLevel;

    await exportBackup();
    const exportedJson = getExportedJson();

    const db = getDb();
    await db.execAsync('DELETE FROM progress');
    await db.execAsync('DELETE FROM durable_events');
    await db.execAsync('DELETE FROM settings');

    await importBackup(exportedJson);
    await reopen();

    const restored = await getProgress('mastery-floor-restart-node');
    expect(restored).not.toBeNull();
    // Anti-shame: the restored mastery_level is never lower than what was
    // captured at export time (here it is exactly equal — a full-replace
    // restore reproduces the exported snapshot precisely; there is no partial
    // merge that could independently subtract from it).
    expect(restored!.masteryLevel).toBe(preMastery);
    expect(restored!.masteryLevel).toBeGreaterThanOrEqual(preMastery);
  });
});
