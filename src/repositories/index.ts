/**
 * Repositories barrel — public API surface for the persistence layer.
 *
 * BARREL GUARD:
 * This file is the sole public interface for all repository modules.
 * It deliberately does NOT expose any module-private helpers. The milestone-state
 * writer, durable-event inserter, and post-commit emitter are all module-local
 * non-exported functions inside milestone-gate.ts — they are not importable by
 * any module (including this barrel). This is the "impossible by construction"
 * structural enforcement of the milestone gate invariant (D2 from interview-brief.md).
 *
 * WHAT IS EXPORTED (public API):
 *   Milestone gate:
 *     recordMilestone            — the single narrow atomic gate
 *     subscribeDurable           — in-process durable event pub/sub
 *
 *   Progress (read-authority + non-milestone mutations):
 *     getProgress
 *     getDueNodes
 *     upsertNonMilestoneProgress
 *
 *   Events (durable feed + firehose append):
 *     appendFirehose
 *     readDurableSince
 *     readAllFirehose            — for compaction / backup
 *
 *   Settings (hot-state seam):
 *     settings                   — SettingsRepository singleton
 *     SettingsRepository         — interface type
 *
 *   Graph migrations (node-identity mastery-migration applier):
 *     applyGraphMigrations       — declarative op applier (anti-shame propagation)
 *     GraphMigrationOp           — discriminated union type for ops
 *
 *   Compaction (firehose-only, shipped disarmed):
 *     decideCompaction           — pure decision function (no side effects)
 *     applyCompaction            — scoped firehose-only apply (durable-immune)
 *     RetentionPolicy            — policy interface type
 *
 *   Backup (user-initiated JSON export/import):
 *     exportBackup               — gather payload + share via expo-sharing
 *     importBackup               — parse + version-gate + atomic full-replace
 *     BackupPayload              — export/import payload shape
 *     BackupTooNewError          — typed error for newer-than-app backups
 */

// Milestone gate (includes subscribeDurable — owner of the in-process listener state)
export { recordMilestone, subscribeDurable } from './milestone-gate';

// Progress repository (public surface only)
export {
  getProgress,
  getDueNodes,
  upsertNonMilestoneProgress,
} from './progress-repository';

// Events repository (public surface only)
export {
  appendFirehose,
  readDurableSince,
  readAllFirehose,
} from './events-repository';
// NOTE: subscribeDurable is exported from milestone-gate above (it owns _listeners).

// Settings seam
export { settings, type SettingsRepository } from './settings-repository';

// Graph-migration applier (stage 01: mechanism + no-op default; stage 02: real ops)
export {
  applyGraphMigrations,
  type GraphMigrationOp,
} from './graph-migration-repository';

// Firehose compaction (shipped disarmed; durable-immune by construction)
export {
  decideCompaction,
  applyCompaction,
  type RetentionPolicy,
} from './compaction';

// Backup repository (user-initiated JSON export/import)
export {
  exportBackup,
  importBackup,
  type BackupPayload,
  BackupTooNewError,
} from './backup-repository';
