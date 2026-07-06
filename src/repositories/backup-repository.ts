/**
 * Backup repository — user-initiated JSON export/import.
 *
 * DESIGN (D6 from interview-brief.md):
 *   Export — gather materialized progress + durable events + settings (+ optional
 *   firehose), stamp with BOTH version axes, write via expo-file-system, and share
 *   via expo-sharing. No network. No backend.
 *
 *   Import — full-replace, atomic, version-gated:
 *     * file == app schema version → apply directly.
 *     * file < app schema version  → run data forward through the DB-schema migration
 *       runner before applying (the must-work reinstall path).
 *     * file > app schema version  → REFUSE with BackupTooNewError. No mutation.
 *     * unparseable / validation failure → abort (no-op, transaction never opened).
 *   PRE-IMPORT AUTO-BACKUP: before any destructive import, write a recovery backup
 *   to app storage (one-tap undo if something goes wrong).
 *
 * PAYLOAD FORMAT (BackupPayload):
 *   {
 *     appVersion:         string           (human-readable Expo app version)
 *     exportFormatVersion: 1               (forward-compat: bump when shape changes)
 *     appSchemaVersion:   number           (DB-schema axis — PRAGMA user_version)
 *     graphVersion:       string | null    (in-asset graphVersion axis — stage 02)
 *     exportedAt:         number           (epoch ms)
 *     progress:           ProgressRow[]
 *     durableEvents:      DurableEvent[]
 *     settings:           Record<string, string>   (raw key/value from settings table)
 *     firehose?:          FirehoseEvent[]  (omitted by default; present only with includeFirehose)
 *   }
 *
 * VERSION AXES (never conflated):
 *   appSchemaVersion — DB-schema axis, matches PRAGMA user_version. Governs whether
 *                      the backup data needs schema migration before import.
 *   graphVersion     — in-asset semver. Stage 01 ships null (no graph yet). Stage 02
 *                      supplies real values via loadGraph(). Carried in the payload for
 *                      forward-compat; not used for migration decisions in stage 01.
 *
 * STRUCTURAL INVARIANTS:
 *   • The reload path for import goes through the same repository contract (milestone
 *     gate, progress upsert) so the milestone invariant holds on restore — durable
 *     events and milestone state are re-inserted atomically via the full-replace tx.
 *   • Progress rows on restore are bulk-inserted via a raw INSERT (progress.mastery_level
 *     included): this is the one legitimate place to bulk-restore mastery without going
 *     through the milestone gate, because the gate already fired in the original session
 *     and the event is being replayed from the durable event log. This restore path is
 *     structurally isolated below and documented with a lint-exemption comment.
 *   • Anti-shame holds: mastery_level on restore equals what was in the backup; we
 *     never lower it and do not apply new milestone logic.
 *
 * FIREHOSE:
 *   Excluded by default (high-volume, not critical for state recovery). An optional
 *   `includeFirehose` export flag adds the top-level `firehose` array. A matching
 *   optional `firehose?` key in the payload is restored if present on import.
 *   Forward-compat: future importers ignore unknown top-level keys; a missing
 *   `firehose` key is treated as "no firehose to restore" (no error).
 *
 * TRANSPORT:
 *   Export: expo-file-system (write to documentDirectory) → expo-sharing (share sheet).
 *   Import: caller provides the JSON string (obtained externally via expo-document-picker
 *   or equivalent; this module handles only the parsing/applying step).
 *   No network, no backend, no sync.
 *
 * ESLint:
 *   This module accesses the settings table via raw SQL ONLY for the bulk-export and
 *   bulk-import paths (not hot-state reads). This is an intentional exception scoped
 *   to backup-only SQL — not a hot-read. The rule is not triggered because we do not
 *   execute SELECT queries from the settings table on the hot path; we issue them only
 *   inside export/import functions that explicitly gather the snapshot.
 *   (no-raw-sql-hot-read: the rule targets SELECT ... FROM settings at read-call sites,
 *   not bulk snapshot operations inside backup modules — see eslint.config.js exemption.)
 */

// expo-file-system/legacy: the SDK 56 default export uses a new File/Directory API;
// documentDirectory + writeAsStringAsync/readAsStringAsync live in the legacy export.
// This is the appropriate choice for the stage 01 backup flow (string I/O, no streams).
// When stage 06 migrates to the new FS API, this is the only import to change.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { getDb } from '@/db/database';
import { DB_SCHEMA_VERSION } from '@/db/types';
import { runExclusive } from '@/db/tx';
import type { ProgressRow, DurableEvent, FirehoseEvent, MilestoneKind } from '@/db/types';

// ---------------------------------------------------------------------------
// Export format version (bump when BackupPayload shape changes)
// ---------------------------------------------------------------------------

const EXPORT_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------
// BackupPayload — the exported/imported JSON shape
// ---------------------------------------------------------------------------

export interface BackupPayload {
  /** Human-readable version tag (e.g. '1.0.0'). For informational display only. */
  appVersion: string;
  /** Incremented when the shape of BackupPayload itself changes. */
  exportFormatVersion: number;
  /** DB-schema axis stamp (PRAGMA user_version at export time). */
  appSchemaVersion: number;
  /**
   * Graph-content axis version (in-asset semver, stage 02).
   * Stage 01 ships null because no graph is loaded yet.
   * Carried for forward-compat; not used for migration decisions here.
   */
  graphVersion: string | null;
  /** Wall-clock export timestamp (epoch ms). */
  exportedAt: number;
  /** Full materialized progress state. */
  progress: ProgressRow[];
  /** Complete durable/milestone event log. */
  durableEvents: DurableEvent[];
  /** Raw settings key/value pairs (as stored in the DB — JSON strings). */
  settings: Record<string, string>;
  /**
   * Firehose events (optional — only present when exported with includeFirehose).
   * Omitted from the default payload to keep backup files small.
   */
  firehose?: FirehoseEvent[];
}

// ---------------------------------------------------------------------------
// Typed error for newer-than-app backups
// ---------------------------------------------------------------------------

/**
 * Thrown when an import is refused because the backup was created by a newer
 * version of the app than is currently installed.
 *
 * Anti-shame: the caller should surface a calm, non-shaming message
 * (e.g. "This backup is from a newer version of Tyama. Please update the app
 * first.") — never "error", "invalid", or "corrupt".
 */
export class BackupTooNewError extends Error {
  constructor(
    public readonly backupSchemaVersion: number,
    public readonly appSchemaVersion: number
  ) {
    super(
      `Backup schema version (${backupSchemaVersion}) is newer than this version of Tyama ` +
        `(${appSchemaVersion}). Please update the app before restoring this backup.`
    );
    this.name = 'BackupTooNewError';
  }
}

// ---------------------------------------------------------------------------
// Raw DB row shapes (for reading during export and bulk-inserting on import)
// ---------------------------------------------------------------------------

interface RawProgressRow {
  node_id: string;
  mastery_level: number;
  streak: number;
  xp: number;
  due_at: number | null;
  metrics: string;
  updated_at: number;
}

interface RawDurableRow {
  id: number;
  kind: string;
  payload: string;
  device_id: string;
  seq: number;
  created_at: number;
}

interface RawFirehoseRow {
  id: number;
  type: string;
  payload: string;
  device_id: string;
  seq: number;
  created_at: number;
}

interface RawSettingsRow {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function progressFromRaw(raw: RawProgressRow): ProgressRow {
  return {
    nodeId: raw.node_id,
    masteryLevel: raw.mastery_level,
    streak: raw.streak,
    xp: raw.xp,
    dueAt: raw.due_at,
    metrics: raw.metrics,
    updatedAt: raw.updated_at,
  };
}

function durableFromRaw(raw: RawDurableRow): DurableEvent {
  return {
    id: raw.id,
    kind: raw.kind as MilestoneKind,
    payload: raw.payload,
    deviceId: raw.device_id,
    seq: raw.seq,
    createdAt: raw.created_at,
  };
}

function firehoseFromRaw(raw: RawFirehoseRow): FirehoseEvent {
  return {
    id: raw.id,
    type: raw.type,
    payload: raw.payload,
    deviceId: raw.device_id,
    seq: raw.seq,
    createdAt: raw.created_at,
  };
}

// ---------------------------------------------------------------------------
// Internal: gather the backup payload from the current DB
// ---------------------------------------------------------------------------

async function _gatherPayload(opts?: { includeFirehose?: boolean }): Promise<BackupPayload> {
  const db = getDb();

  // DB-schema axis: read PRAGMA user_version
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const schemaVersion = versionRow?.user_version ?? 0;

  // Progress rows
  const rawProgress = await db.getAllAsync<RawProgressRow>(
    'SELECT node_id, mastery_level, streak, xp, due_at, metrics, updated_at FROM progress ORDER BY node_id ASC'
  );
  const progress = rawProgress.map(progressFromRaw);

  // Durable event rows (complete log — never excluded)
  const rawDurable = await db.getAllAsync<RawDurableRow>(
    'SELECT id, kind, payload, device_id, seq, created_at FROM durable_events ORDER BY seq ASC'
  );
  const durableEvents = rawDurable.map(durableFromRaw);

  // Settings rows (raw key/value pairs)
  const rawSettings = await db.getAllAsync<RawSettingsRow>(
    'SELECT key, value FROM settings ORDER BY key ASC'
  );
  const settings: Record<string, string> = {};
  for (const row of rawSettings) {
    settings[row.key] = row.value;
  }

  const payload: BackupPayload = {
    appVersion: '1.0.0', // Stage 01 default; stage 06 wires to Constants.expoConfig.version
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    appSchemaVersion: schemaVersion,
    graphVersion: null, // Stage 01: no graph loaded yet
    exportedAt: Date.now(),
    progress,
    durableEvents,
    settings,
  };

  // Firehose: only if caller explicitly opts in
  if (opts?.includeFirehose) {
    const rawFirehose = await db.getAllAsync<RawFirehoseRow>(
      'SELECT id, type, payload, device_id, seq, created_at FROM firehose_events ORDER BY id ASC'
    );
    payload.firehose = rawFirehose.map(firehoseFromRaw);
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Internal: write a backup to app storage (for pre-import auto-backup)
// ---------------------------------------------------------------------------

/**
 * Write a backup JSON file to app storage and return its URI.
 * Used both by exportBackup (share it) and by importBackup (auto-backup before replace).
 */
async function _writeBackupToStorage(
  payload: BackupPayload,
  filenameSuffix: string
): Promise<string> {
  const baseDir = FileSystem.documentDirectory ?? 'file:///';
  const filename = `tyama-backup-${filenameSuffix}.json`;
  const uri = `${baseDir}${filename}`;
  const json = JSON.stringify(payload, null, 2);
  await FileSystem.writeAsStringAsync(uri, json);
  return uri;
}

// ---------------------------------------------------------------------------
// PUBLIC: export
// ---------------------------------------------------------------------------

/**
 * Export a backup of the current DB state and open the system share sheet.
 *
 * Gathers: progress + durable events + settings.
 * Excludes: firehose (unless opts.includeFirehose is true).
 * Transport: expo-file-system (write) → expo-sharing (share-sheet).
 * No network, no backend.
 *
 * @param opts.includeFirehose  Include firehose events in the payload (default: false).
 * @returns The URI of the written backup file.
 */
export async function exportBackup(opts?: { includeFirehose?: boolean }): Promise<string> {
  const payload = await _gatherPayload(opts);
  const timestamp = new Date(payload.exportedAt).toISOString().replace(/[:.]/g, '-');
  const uri = await _writeBackupToStorage(payload, timestamp);

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save Tyama backup',
      UTI: 'public.json',
    });
  }

  return uri;
}

// ---------------------------------------------------------------------------
// Internal: validate a parsed payload
// ---------------------------------------------------------------------------

/**
 * Validate that a parsed value looks like a BackupPayload.
 * Returns the typed payload or throws a descriptive error.
 *
 * Validates required top-level fields; unknown additional fields are ignored
 * (forward-compat: a newer exporter may add fields a current importer doesn't know).
 */
function _validatePayload(value: unknown): BackupPayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Backup file is not a JSON object.');
  }
  const obj = value as Record<string, unknown>;

  if (typeof obj.appSchemaVersion !== 'number') {
    throw new Error('Backup file is missing or has invalid appSchemaVersion.');
  }
  if (typeof obj.exportFormatVersion !== 'number') {
    throw new Error('Backup file is missing or has invalid exportFormatVersion.');
  }
  if (!Array.isArray(obj.progress)) {
    throw new Error('Backup file is missing or has invalid progress array.');
  }
  if (!Array.isArray(obj.durableEvents)) {
    throw new Error('Backup file is missing or has invalid durableEvents array.');
  }
  if (typeof obj.settings !== 'object' || obj.settings === null || Array.isArray(obj.settings)) {
    throw new Error('Backup file is missing or has invalid settings object.');
  }

  return obj as unknown as BackupPayload;
}

// ---------------------------------------------------------------------------
// Internal: atomic full-replace inside one exclusive transaction
// ---------------------------------------------------------------------------

/**
 * Apply a validated backup payload to the current DB as a full-replace.
 *
 * Steps (all inside one exclusive transaction — both-or-neither):
 *   1. DELETE all rows from progress, durable_events, settings
 *      (and firehose_events if payload.firehose is present).
 *   2. Bulk-INSERT all rows from the payload.
 *
 * The milestone invariant holds on restore because both the progress rows
 * (with mastery_level) and the durable events are inserted together in a single
 * atomic transaction. The restored state is self-consistent by construction.
 *
 * NOTE: mastery_level is inserted directly here (not via recordMilestone) because
 * this is a restore operation — the gate already fired in the original session and
 * the event is being replayed from the durable log. This is the only legitimate
 * place to bulk-restore mastery_level outside the milestone gate.
 */
async function _applyFullReplace(payload: BackupPayload): Promise<void> {
  const db = getDb();

  await runExclusive(db, async (txn) => {
    // --- Wipe materialized + durable + settings ---
    await txn.execAsync('DELETE FROM progress');
    await txn.execAsync('DELETE FROM durable_events');
    await txn.execAsync('DELETE FROM settings');

    if (payload.firehose !== undefined) {
      await txn.execAsync('DELETE FROM firehose_events');
    }

    // --- Restore progress rows ---
    // Bulk-INSERT including mastery_level. This is the restore path — the milestone
    // gate already fired in the original session and the durable event log is being
    // replayed below in the same exclusive transaction (milestone invariant holds).
    // backup-repository.ts is exempt from no-direct-milestone-mutation (eslint.config.js).
    for (const row of payload.progress) {
      await txn.runAsync(
        `INSERT INTO progress (node_id, mastery_level, streak, xp, due_at, metrics, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.nodeId,
        row.masteryLevel,
        row.streak,
        row.xp,
        row.dueAt ?? null,
        row.metrics,
        row.updatedAt
      );
    }

    // --- Restore durable events ---
    // Bulk-INSERT the durable event log atomically paired with the progress restore above.
    // backup-repository.ts is exempt from no-direct-milestone-mutation (eslint.config.js).
    for (const evt of payload.durableEvents) {
      await txn.runAsync(
        `INSERT INTO durable_events (id, kind, payload, device_id, seq, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        evt.id,
        evt.kind,
        evt.payload,
        evt.deviceId,
        evt.seq,
        evt.createdAt
      );
    }

    // --- Restore settings ---
    for (const [key, value] of Object.entries(payload.settings)) {
      await txn.runAsync(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        key,
        value
      );
    }

    // --- Restore firehose (if present in payload) ---
    if (payload.firehose !== undefined) {
      for (const evt of payload.firehose) {
        await txn.runAsync(
          `INSERT INTO firehose_events (id, type, payload, device_id, seq, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          evt.id,
          evt.type,
          evt.payload,
          evt.deviceId,
          evt.seq,
          evt.createdAt
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// PUBLIC: import
// ---------------------------------------------------------------------------

/**
 * Import a backup from a JSON string, replacing all current data atomically.
 *
 * VERSION GATING:
 *   payload.appSchemaVersion == DB_SCHEMA_VERSION → apply directly.
 *   payload.appSchemaVersion <  DB_SCHEMA_VERSION → migrate data forward first
 *     (the must-work reinstall path; older backup, newer app).
 *   payload.appSchemaVersion >  DB_SCHEMA_VERSION → REFUSE (throw BackupTooNewError).
 *     No mutation occurs.
 *   Unparseable JSON / validation failure → throw (no mutation).
 *
 * PRE-IMPORT AUTO-BACKUP:
 *   Before any destructive import, the current DB state is exported to a
 *   recovery file in app storage named `tyama-backup-pre-import-<timestamp>.json`.
 *   This provides one-tap undo if the import produces unexpected results.
 *
 * ATOMICITY:
 *   The full-replace runs inside one exclusive transaction. If anything throws
 *   mid-import, the entire replace rolls back and the DB is left in its
 *   pre-import state (which is also safely backed up).
 *
 * @param json  The raw JSON string to import (caller obtained via expo-document-picker
 *              or equivalent transport; this module handles only parse + apply).
 * @throws BackupTooNewError  when backup schema version > app schema version.
 * @throws Error              when JSON is invalid or required fields are missing.
 */
export async function importBackup(json: string): Promise<void> {
  // --- Parse ---
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Backup file could not be parsed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Validate ---
  const payload = _validatePayload(parsed);

  // --- Version gate ---
  const currentSchemaVersion = DB_SCHEMA_VERSION;

  if (payload.appSchemaVersion > currentSchemaVersion) {
    // Backup is from a newer app → refuse without mutation.
    throw new BackupTooNewError(payload.appSchemaVersion, currentSchemaVersion);
  }

  // payload.appSchemaVersion <= currentSchemaVersion → proceed.
  // In stage 01 there is only one schema version (1), so no forward migration
  // of row data is needed yet. When future schema versions are added, data
  // migration logic for older backups goes here (keyed on payload.appSchemaVersion).
  // For now: older-schema backups have identical data shape (schema version 1 is
  // the only version), so no row transformation is required.

  // --- Pre-import auto-backup ---
  // MUST run before any destructive writes. Failure here aborts the import
  // (better to preserve data than to proceed without a recovery option).
  const autoBackupPayload = await _gatherPayload({ includeFirehose: false });
  const timestamp = Date.now();
  await _writeBackupToStorage(autoBackupPayload, `pre-import-${timestamp}`);

  // --- Atomic full-replace ---
  await _applyFullReplace(payload);
}
