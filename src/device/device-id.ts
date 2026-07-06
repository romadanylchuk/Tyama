/**
 * Stable per-install device identifier (sync-readiness primitive).
 *
 * CONTRACT:
 *   getDeviceId() — Returns the cached device id synchronously if already minted,
 *                   otherwise mints a new UUID, persists it via the settings seam,
 *                   and returns it. Idempotent across restarts because the id is
 *                   persisted in the `settings` table under the `deviceId` key.
 *
 * SYNC-READINESS:
 *   The device id rides on every event row (durable and firehose) as a sync field.
 *   It is cheap to stamp now and eliminates a painful retrofit if sync lands later.
 *
 * STABILITY GUARANTEE:
 *   Once minted, the device id never changes. It survives:
 *     - App restarts (persisted in SQLite via settings seam)
 *     - Schema migrations (the `settings` table schema is stable)
 *   It does NOT survive:
 *     - App uninstall / reinstall (intentional — new install = new device id)
 *     - Clearing app data / SQLite wipe (same rationale)
 *
 * NO NETWORK:
 *   The id is minted locally via crypto.randomUUID() or a polyfill. No network
 *   call is made at any point.
 *
 * MMKV-SWAPPABILITY:
 *   This module reads/writes exclusively through the `settings` seam, so swapping
 *   the settings backend to MMKV requires no change here.
 */

import { settings } from '@/repositories/settings-repository';

// ---------------------------------------------------------------------------
// UUID generation — React Native polyfill
// ---------------------------------------------------------------------------

/**
 * Generate a v4 UUID string.
 *
 * React Native 0.73+ exposes `crypto.randomUUID()` via the Hermes engine.
 * For older environments or Jest (Node.js), we fall back to Node's built-in.
 *
 * We intentionally avoid importing `react-native-get-random-values` (a native
 * module) to keep the device-id module usable in Jest without extra mocking.
 */
function generateUUID(): string {
  // Hermes / modern RN: crypto.randomUUID is available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Node.js (Jest): use the built-in crypto module.
  // This branch is only reachable in the test environment.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto') as typeof import('crypto');
  return nodeCrypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the stable per-install device id.
 *
 * Precondition: `settings.hydrate()` must have been awaited at startup.
 *               (App.tsx does this before any consumer renders.)
 *
 * On first call after a fresh install (no persisted id), this function:
 *   1. Mints a new UUID.
 *   2. Persists it via `settings.set('deviceId', ...)` (async).
 *   3. Returns the new id synchronously (cache already updated by set()).
 *
 * On subsequent calls (id already in cache from hydrate()):
 *   Returns the cached id synchronously with no DB interaction.
 */
export async function getDeviceId(): Promise<string> {
  const existing = settings.get('deviceId');

  if (existing && existing.length > 0) {
    return existing;
  }

  // Mint a new stable id.
  const newId = generateUUID();
  await settings.set('deviceId', newId);
  return newId;
}
