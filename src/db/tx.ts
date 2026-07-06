/**
 * Thin transaction wrapper helpers over the expo-sqlite async API.
 *
 * Two transaction modes, each with a distinct semantic contract:
 *
 * runExclusive — wraps db.withExclusiveTransactionAsync (BEGIN EXCLUSIVE).
 *   Use for the milestone gate and the migration runner.
 *   Gives the strongest atomicity guarantee expo-sqlite offers on native.
 *   The task receives a `txn` object (same interface as SQLiteDatabase) and
 *   must do ALL its work through that object.
 *
 * runRelaxed — wraps db.withTransactionAsync (BEGIN deferred).
 *   Use for firehose appends where relaxed guarantees are acceptable.
 *   The task receives NO txn argument — it closes over the db reference directly.
 *   This is intentional: firehose is never inside an exclusive tx, and passing
 *   the db reference through avoids accidental re-use of the txn object.
 *
 * Note: withExclusiveTransactionAsync is not supported on web (expo-sqlite docs).
 * In the Jest test environment we substitute it via the test helper in jest.setup.ts.
 */

import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Execute `task` in a BEGIN EXCLUSIVE transaction.
 * The `txn` parameter passed to the task is the transaction-scoped database
 * object — all statements inside the task MUST use `txn`, not the outer `db`.
 *
 * Used by: migration runner, milestone gate.
 *
 * WEB FALLBACK: expo-sqlite's web driver does not implement
 * withExclusiveTransactionAsync (BEGIN EXCLUSIVE). On web there is a single
 * connection with no concurrent writers, so the exclusive lock is moot; we
 * fall back to withTransactionAsync, which still gives atomic commit/rollback.
 * Native (iOS/Android) is unchanged and keeps the full BEGIN EXCLUSIVE lock.
 */
export async function runExclusive(
  db: SQLiteDatabase,
  task: (txn: SQLiteDatabase) => Promise<void>
): Promise<void> {
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => task(db));
    return;
  }
  await db.withExclusiveTransactionAsync(task);
}

/**
 * Execute `task` in a plain (deferred) transaction.
 * The task closes over the `db` it needs — no txn argument is forwarded.
 * This is the firehose path; relaxed ordering guarantees are acceptable here.
 *
 * Used by: firehose append, non-milestone progress upserts.
 */
export async function runRelaxed(
  db: SQLiteDatabase,
  task: () => Promise<void>
): Promise<void> {
  await db.withTransactionAsync(task);
}
