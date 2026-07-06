/**
 * Migration 001 — initial schema.
 *
 * Creates all stage-01 tables and indices:
 *   - progress (with partial due_at index)
 *   - durable_events
 *   - firehose_events (with created_at index)
 *   - settings
 *   - graph_migrations
 *
 * This migration step runs inside its own exclusive transaction (BEGIN EXCLUSIVE)
 * via the migration runner. PRAGMA user_version = 1 is stamped as the LAST
 * statement of that same transaction to guarantee atomicity.
 *
 * If this migration fails mid-way, the transaction rolls back and user_version
 * remains at 0 — the runner will retry on next app start.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import {
  CREATE_PROGRESS_TABLE,
  CREATE_PROGRESS_DUE_INDEX,
  CREATE_DURABLE_EVENTS_TABLE,
  CREATE_FIREHOSE_EVENTS_TABLE,
  CREATE_FIREHOSE_CREATED_AT_INDEX,
  CREATE_SETTINGS_TABLE,
  CREATE_GRAPH_MIGRATIONS_TABLE,
} from '../schema';

export interface MigrationStep {
  /** Target user_version after this step completes. */
  version: number;
  /** Human-readable name for logging/debugging. */
  name: string;
  /** DDL work to execute within the runner's exclusive transaction. */
  up: (txn: SQLiteDatabase) => Promise<void>;
}

export const migration001: MigrationStep = {
  version: 1,
  name: 'initial',
  async up(txn: SQLiteDatabase): Promise<void> {
    // progress table + partial index
    await txn.execAsync(CREATE_PROGRESS_TABLE);
    await txn.execAsync(CREATE_PROGRESS_DUE_INDEX);

    // durable event log (compaction-immune milestone history)
    await txn.execAsync(CREATE_DURABLE_EVENTS_TABLE);

    // firehose event log (high-volume, compaction-eligible)
    await txn.execAsync(CREATE_FIREHOSE_EVENTS_TABLE);
    await txn.execAsync(CREATE_FIREHOSE_CREATED_AT_INDEX);

    // hot-state settings seam
    await txn.execAsync(CREATE_SETTINGS_TABLE);

    // graph-node identity migration spine (ships empty; stage 02 populates)
    await txn.execAsync(CREATE_GRAPH_MIGRATIONS_TABLE);
  },
};
