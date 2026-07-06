/**
 * Closed SettingsSchema key→type map for the Tyama settings seam.
 *
 * All hot-state reads/writes go through SettingsRepository, which is
 * parameterized by this interface. Adding a new setting requires:
 *   1. Add the key here with its value type.
 *   2. Add a default value to SETTINGS_DEFAULTS below.
 *   3. TypeScript will catch all call sites.
 *
 * LANGUAGE-NEUTRAL CORE:
 * Three independent language keys are modelled even though the MVP binds them
 * to a single picker. The MVP binding is a PRESENTATION-LAYER policy; storage
 * always keeps them separate. A future "content in Ukrainian, UI in English"
 * mode requires no storage migration.
 *
 *   uiLanguage          — language for the application's navigation, labels,
 *                         tooltips, and button text.
 *   contentLanguage     — language/locale for problem text, number formatting,
 *                         and math flavor text (fruit names, etc.).
 *   explanationLanguage — language for the ExplanationProvider context strings
 *                         copied to the user's clipboard.
 *
 * SYNC-READINESS PRIMITIVES:
 *   deviceId    — stable opaque per-install identifier; see device/device-id.ts.
 *   logicalSeq  — persisted high-water mark for the monotonic logical clock;
 *                 see device/logical-clock.ts.
 *
 * MMKV-SWAPPABILITY:
 * SettingsRepository exposes get<K>/set<K> typed by this interface. Swapping
 * the implementation to MMKV changes only the implementation file; zero
 * consumer changes are required.
 */

import type { NodeId } from '@/db/types';

// ---------------------------------------------------------------------------
// Schema interface — the closed key→type map
// ---------------------------------------------------------------------------

export interface SettingsSchema {
  /** BCP-47 language tag for the application UI (navigation, labels). */
  uiLanguage: string;
  /** BCP-47 language tag for math problem text and number formatting. */
  contentLanguage: string;
  /** BCP-47 language tag for ExplanationProvider clipboard output. */
  explanationLanguage: string;
  /** Persona/theme bundle enum id (e.g. 'default'; stage 06 expands). */
  persona: string;
  /** Currently active skill-graph node id, or null if not yet selected. */
  currentNodeId: NodeId | null;
  /** Stable per-install device identifier (sync-readiness). */
  deviceId: string;
  /** Persisted logical-clock high-water mark (sync-readiness). */
  logicalSeq: number;
  /**
   * The graph-content version that was last applied on this install.
   *
   * TWO VERSION AXES — NEVER CONFLATE:
   *   This key tracks the graph-content axis (semver `graphVersion` from the
   *   graph asset). It is entirely separate from `DB_SCHEMA_VERSION` /
   *   `PRAGMA user_version` (the DB-schema axis). The two axes migrate on
   *   independent clocks; conflating them would silently break graph-migration
   *   bookkeeping.
   *
   * `''` (empty string) on a fresh install — signals that no graph version has
   * yet been applied. `reconcileGraphVersion()` treats `'' !== '0.1.0'` as a
   * first-run condition and runs `applyGraphMigrations([])` (no-op) before
   * persisting `'0.1.0'`.
   */
  appliedGraphVersion: string;
  /**
   * First-run onboarding gate flag (stage 07).
   *
   * `false` (the default) means the app has not yet completed the separate
   * first-run onboarding flow (Welcome → Language → Persona → Shortened
   * placement → Done) and the startup shell shows onboarding instead of the
   * main loop. The onboarding `DoneScreen` sets this to `true` exactly once.
   *
   * This is a pure hot-state gate — it flows through the existing hydrate/
   * get/set seam with no DB migration (an absent key defaults to `false` on
   * hydrate, per the standard SETTINGS_DEFAULTS mechanism above).
   */
  onboardingComplete: boolean;
}

// ---------------------------------------------------------------------------
// Default values — applied at hydration time for keys absent from the DB
// ---------------------------------------------------------------------------

/**
 * First-run defaults for all settings keys.
 *
 * UK Ukrainian ('uk') is the MVP UI language. All three language keys share
 * the same default intentionally — the presentation layer may offer a single
 * picker that sets all three simultaneously, but the schema keeps them
 * independent so that future per-axis control requires no migration.
 *
 * `currentNodeId: null` signals that onboarding has not yet selected a node.
 * `deviceId: ''`       signals that the device-id has not yet been minted
 *                      (getDeviceId() will mint and persist on first call).
 * `logicalSeq: 0`      the clock starts at zero on a fresh install.
 * `persona: 'default'` the alias resolved by the theme layer (stage 06); the
 *                      onboarding `PersonaScreen` skip path writes the
 *                      explicit `'adult-16+'` enum value instead of relying
 *                      on this alias, so downstream reads are unambiguous.
 * `onboardingComplete: false` a fresh install has not yet completed the
 *                      first-run onboarding flow — the startup shell shows
 *                      onboarding until `DoneScreen` flips this to `true`.
 */
export const SETTINGS_DEFAULTS: SettingsSchema = {
  uiLanguage: 'uk',
  contentLanguage: 'uk',
  explanationLanguage: 'uk',
  persona: 'default',
  currentNodeId: null,
  deviceId: '',
  logicalSeq: 0,
  /**
   * Empty string on a fresh install — `reconcileGraphVersion()` detects this as
   * a first-run condition and persists the asset graphVersion after a no-op migration.
   */
  appliedGraphVersion: '',
  onboardingComplete: false,
};
