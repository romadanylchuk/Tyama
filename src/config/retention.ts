/**
 * Firehose compaction retention policy — config-as-data.
 *
 * This policy is SHIPPED DISABLED. To arm compaction in a future release,
 * change `enabled: true` here (config change, no code change required).
 *
 * The compaction mechanism (decideCompaction + applyCompaction in
 * src/repositories/compaction.ts) reads this policy and is a no-op when
 * enabled is false.
 *
 * DURABLE IMMUNITY:
 * This policy governs firehose_events ONLY. The durable_events table is
 * structurally excluded from every compaction code path — it is never
 * referenced in applyCompaction(). See compaction.ts and its guardrail test.
 *
 * INVARIANT:
 *   trigger: 'manual' means compaction only runs when applyCompaction() is
 *   called explicitly (e.g. from a settings/maintenance screen). Auto-trigger
 *   support (on-open, on-idle) is deferred — the mechanism supports it as data;
 *   the UI to surface it is out of MVP scope.
 */

/** Governs which firehose rows are eligible for deletion. */
export interface RetentionPolicy {
  /**
   * Master switch. When false, decideCompaction always returns [] and
   * applyCompaction immediately returns 0 without a DB read.
   */
  enabled: boolean;
  /**
   * Firehose rows older than this many days (by created_at) are eligible.
   * Only evaluated when enabled === true.
   */
  maxAgeDays: number;
  /**
   * When firehose row count exceeds this threshold, the oldest rows beyond
   * the threshold are eligible for deletion. Only evaluated when enabled === true.
   */
  maxRows: number;
  /**
   * When compaction should run.
   * 'manual' = only when applyCompaction() is called explicitly.
   * Future values ('on-open', 'on-idle') may be added as data without a
   * code change — the trigger logic lives outside this config.
   */
  trigger: 'manual';
}

/**
 * Default retention policy shipped with the app.
 *
 * Disabled so no compaction occurs in MVP. The mechanism exists and is tested;
 * a future calibration pass enables it as a data change.
 *
 * Values chosen conservatively:
 *   maxAgeDays: 90  — three months of behavioral data before eligible
 *   maxRows: 50000  — ~50K events before count-based pruning kicks in
 */
export const RETENTION_POLICY: RetentionPolicy = {
  enabled: false,
  maxAgeDays: 90,
  maxRows: 50_000,
  trigger: 'manual',
};
