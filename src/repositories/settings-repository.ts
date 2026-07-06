/**
 * SettingsRepository — typed hot-state seam for the Tyama app.
 *
 * CONTRACT:
 *   hydrate()     — MUST be awaited once at startup (after initDatabase()) before
 *                   any get() call is issued. Bulk-SELECTs all rows from the
 *                   `settings` table and populates the in-memory cache, applying
 *                   SETTINGS_DEFAULTS for keys absent from the DB.
 *
 *   get<K>(key)   — SYNCHRONOUS. Returns the cached value for `key`. Returns the
 *                   schema default if hydrate() has not yet been called for that key
 *                   (safe for edge cases; App.tsx awaits hydrate() before rendering).
 *
 *   set<K>(key, value) — Updates the cache immediately (synchronous path), then
 *                        persists to the `settings` table asynchronously via
 *                        INSERT … ON CONFLICT(key) DO UPDATE. Returns a Promise
 *                        that resolves when the DB write completes.
 *
 * MMKV-SWAPPABILITY:
 * The exported `settings` singleton implements SettingsRepository. Replacing the
 * storage backend requires only replacing this module — zero consumer changes.
 *
 * RAW-SQL EXEMPTION:
 * This module is the ONE legitimate place that issues raw SQL reads on the
 * `settings` table. All other modules must go through `settings.get()`.
 * The no-raw-sql-hot-read ESLint rule exempts this file.
 *
 * SEAM DISCIPLINE:
 * No business logic lives here — only storage/cache mechanics. The seam is kept
 * thin so that future backends (MMKV, SecureStore, cloud sync) are a drop-in.
 */

import { getDb } from '@/db/database';
import {
  type SettingsSchema,
  SETTINGS_DEFAULTS,
} from '@/settings/settings-schema';

// ---------------------------------------------------------------------------
// Interface (contracts-first)
// ---------------------------------------------------------------------------

export interface SettingsRepository {
  /**
   * Hydrate the in-memory cache from the DB.
   * Must be awaited once on app startup after initDatabase().
   * Safe to call multiple times (subsequent calls re-hydrate the cache).
   */
  hydrate(): Promise<void>;

  /**
   * Synchronous cache-backed read.
   * Returns the schema default if the key was never written.
   */
  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K];

  /**
   * Async write: updates the in-memory cache immediately, then persists.
   * The caller can fire-and-forget (for UI hot-state) or await (for
   * correctness-critical writes like deviceId and logicalSeq).
   */
  set<K extends keyof SettingsSchema>(
    key: K,
    value: SettingsSchema[K]
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Row type returned by the settings table
// ---------------------------------------------------------------------------

interface SettingsRow {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SettingsRepositoryImpl implements SettingsRepository {
  /**
   * In-memory cache. Populated by hydrate(); kept in sync by set().
   *
   * We store values as the typed SettingsSchema values (not raw JSON strings)
   * to guarantee that get() never needs to parse JSON on the hot read path.
   */
  private _cache: Partial<SettingsSchema> = {};

  async hydrate(): Promise<void> {
    const db = getDb();
    const rows = await db.getAllAsync<SettingsRow>(
      'SELECT key, value FROM settings'
    );

    // Reset cache to schema defaults first, then overlay DB values.
    // We work with a plain object cast to Record for assignment flexibility,
    // then assign the fully-populated object to the typed cache.
    const cache = { ...SETTINGS_DEFAULTS } as Record<string, unknown>;

    for (const row of rows) {
      const key = row.key;
      if (key in SETTINGS_DEFAULTS) {
        try {
          // Values are stored as JSON strings — parse back to the typed value.
          cache[key] = JSON.parse(row.value) as unknown;
        } catch {
          // Malformed JSON — keep the default; do not crash.
          // This should never happen in production (we JSON.stringify on write).
        }
      }
    }

    this._cache = cache as Partial<SettingsSchema>;
  }

  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    if (key in this._cache) {
      return (this._cache as SettingsSchema)[key];
    }
    // Pre-hydration fallback: return schema default synchronously.
    // App.tsx awaits hydrate() before rendering, so this path is only hit
    // in the extremely unlikely scenario of a get() before hydrate().
    return SETTINGS_DEFAULTS[key];
  }

  async set<K extends keyof SettingsSchema>(
    key: K,
    value: SettingsSchema[K]
  ): Promise<void> {
    // Update cache synchronously so subsequent get() calls see the new value
    // immediately, even before the async DB write completes.
    (this._cache as SettingsSchema)[key] = value;

    const db = getDb();
    const jsonValue = JSON.stringify(value);

    // UPSERT: insert or update if the key already exists.
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      jsonValue
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/**
 * The settings repository singleton.
 *
 * Usage:
 *   import { settings } from '@/repositories/settings-repository';
 *   await settings.hydrate();         // once, at app startup
 *   const lang = settings.get('uiLanguage');   // sync thereafter
 *   await settings.set('uiLanguage', 'en');    // async write
 */
export const settings: SettingsRepository = new SettingsRepositoryImpl();
