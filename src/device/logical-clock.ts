/**
 * Monotonic logical clock (sync-readiness primitive).
 *
 * CONTRACT:
 *   nextSeq() — Returns the next sequence number as a strictly increasing
 *               integer. The high-water mark is persisted via the settings seam
 *               under the `logicalSeq` key so the counter survives restarts.
 *
 * INVARIANT:
 *   Every call to nextSeq() returns a value strictly greater than any previously
 *   returned value, even across app restarts. This is guaranteed because:
 *     1. The current high-water mark is read from the cache (restored from DB
 *        at startup via settings.hydrate()).
 *     2. The incremented value is written to the cache immediately (synchronous
 *        path of settings.set()) before the new seq is returned.
 *     3. The DB write is async (fire-and-forget) but the cache update is
 *        synchronous, so concurrent calls within one session are still ordered.
 *
 * SYNC-READINESS:
 *   The seq field rides on every event row (durable and firehose). It enables
 *   an eventual sync backend to order events per device without a real-time clock.
 *   It is NOT a Lamport clock (no merging of remote clocks in MVP).
 *
 * PERFORMANCE:
 *   nextSeq() is synchronous for the read + cache-update path. The async DB
 *   persist is fire-and-forget for the firehose (tolerable loss). For durable
 *   events the milestone gate stamps deviceId + seq INSIDE the exclusive tx,
 *   so the gate calls nextSeq() and then persists the resulting seq with the
 *   event — the high-water mark write is thus covered by the milestone tx's
 *   commit (NOT fire-and-forget for that path).
 *
 * MMKV-SWAPPABILITY:
 *   Reads/writes exclusively through the `settings` seam.
 */

import { settings } from '@/repositories/settings-repository';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the next monotonic sequence number and persist the new high-water mark.
 *
 * Precondition: `settings.hydrate()` must have been awaited at startup.
 *
 * The returned value is `current + 1` where `current` is the value in the
 * settings cache. The cache is updated synchronously before the value is returned
 * so that back-to-back calls within one session yield strictly ordered values.
 *
 * The DB write is async and awaited by the caller in correctness-critical paths
 * (e.g. the milestone gate). Fire-and-forget callers (e.g. firehose) may choose
 * not to await — the worst outcome is a seq gap on crash (tolerable).
 */
export async function nextSeq(): Promise<number> {
  const current = settings.get('logicalSeq');
  const next = current + 1;
  // settings.set() updates the cache synchronously (before the DB write),
  // so the next call to nextSeq() will read `next` from the cache even if
  // the DB write has not yet completed.
  await settings.set('logicalSeq', next);
  return next;
}
