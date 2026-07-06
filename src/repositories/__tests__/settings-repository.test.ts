/**
 * Tests for the SettingsRepository, device-id, and logical-clock primitives.
 *
 * All tests use a fresh in-memory SQLite database per test via useTestDb()
 * so that there is no state leakage between tests.
 *
 * Test cases cover the completion criterion for Phase 3:
 *   (a) set then sync get returns value without await on read
 *   (b) hydrate restores persisted values into cache
 *   (c) defaults applied for unset keys
 *   (d) three language keys are independent
 *   (e) logical clock is strictly increasing across simulated restarts (re-hydrate)
 *   (f) device id is stable across re-hydrate
 *   (g) device id is minted once and reused
 *   (h) nextSeq() is strictly monotonic within a session
 *   (i) nextSeq() persists high-water mark so a fresh hydration sees the current value
 */

import { useTestDb } from '../../../jest.setup';
import { settings } from '../settings-repository';
import { getDeviceId } from '../../device/device-id';
import { nextSeq } from '../../device/logical-clock';

// Wire per-test in-memory DB isolation.
// useTestDb() registers beforeEach/afterEach to open/close a fresh DB per test
// and injects it into the getDb() singleton.
useTestDb();

// ---------------------------------------------------------------------------
// Helper: re-hydrate the settings singleton from the current (test) DB.
// This simulates an "app restart" — the cache is discarded and re-populated
// from whatever is in the DB.
// ---------------------------------------------------------------------------
async function simulateRestart(): Promise<void> {
  await settings.hydrate();
}

// ---------------------------------------------------------------------------
// (c) Defaults applied for unset keys
// ---------------------------------------------------------------------------

describe('SettingsRepository — defaults', () => {
  it('returns schema defaults before any set() call', async () => {
    await simulateRestart();
    expect(settings.get('uiLanguage')).toBe('uk');
    expect(settings.get('contentLanguage')).toBe('uk');
    expect(settings.get('explanationLanguage')).toBe('uk');
    expect(settings.get('persona')).toBe('default');
    expect(settings.get('currentNodeId')).toBeNull();
    expect(settings.get('logicalSeq')).toBe(0);
    expect(settings.get('onboardingComplete')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onboardingComplete — first-run onboarding gate flag (stage 07 Phase 1)
// ---------------------------------------------------------------------------

describe('SettingsRepository — onboardingComplete gate flag', () => {
  it('defaults to false on a fresh hydrate', async () => {
    await simulateRestart();
    expect(settings.get('onboardingComplete')).toBe(false);
  });

  it('set → get → hydrate round-trips true', async () => {
    await simulateRestart();
    await settings.set('onboardingComplete', true);
    expect(settings.get('onboardingComplete')).toBe(true);
    // Simulate restart: re-hydrate from DB
    await simulateRestart();
    expect(settings.get('onboardingComplete')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (a) set then sync get returns value without await on read
// ---------------------------------------------------------------------------

describe('SettingsRepository — sync reads after set()', () => {
  it('get() returns the new value synchronously after set() resolves', async () => {
    await simulateRestart();
    await settings.set('uiLanguage', 'en');
    // No await on the read — must be synchronous
    const lang = settings.get('uiLanguage');
    expect(lang).toBe('en');
  });

  it('get() reflects the cache update from set() before DB write completes', async () => {
    await simulateRestart();
    // Fire set without awaiting (simulate fire-and-forget)
    const writePromise = settings.set('persona', 'nature');
    // Cache should be updated synchronously already
    expect(settings.get('persona')).toBe('nature');
    // Now await to ensure the DB write also completes
    await writePromise;
    expect(settings.get('persona')).toBe('nature');
  });
});

// ---------------------------------------------------------------------------
// (b) hydrate restores persisted values into cache
// ---------------------------------------------------------------------------

describe('SettingsRepository — hydrate persistence', () => {
  it('hydrate restores a value written in a previous session', async () => {
    await simulateRestart();
    await settings.set('persona', 'ocean');
    // Simulate restart: re-hydrate from DB
    await simulateRestart();
    expect(settings.get('persona')).toBe('ocean');
  });

  it('hydrate restores null values (currentNodeId)', async () => {
    await simulateRestart();
    // Set to a non-null value first
    await settings.set('currentNodeId', 'multiplication');
    await simulateRestart();
    expect(settings.get('currentNodeId')).toBe('multiplication');
    // Now reset to null
    await settings.set('currentNodeId', null);
    await simulateRestart();
    expect(settings.get('currentNodeId')).toBeNull();
  });

  it('hydrate restores numeric values (logicalSeq)', async () => {
    await simulateRestart();
    await settings.set('logicalSeq', 42);
    await simulateRestart();
    expect(settings.get('logicalSeq')).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// (d) Three language keys are independent
// ---------------------------------------------------------------------------

describe('SettingsRepository — three language keys are independent', () => {
  it('setting uiLanguage does not affect contentLanguage or explanationLanguage', async () => {
    await simulateRestart();
    await settings.set('uiLanguage', 'en');
    expect(settings.get('uiLanguage')).toBe('en');
    expect(settings.get('contentLanguage')).toBe('uk'); // unchanged default
    expect(settings.get('explanationLanguage')).toBe('uk'); // unchanged default
  });

  it('three language keys survive hydration independently', async () => {
    await simulateRestart();
    await settings.set('uiLanguage', 'en');
    await settings.set('contentLanguage', 'fr');
    await settings.set('explanationLanguage', 'de');
    await simulateRestart();
    expect(settings.get('uiLanguage')).toBe('en');
    expect(settings.get('contentLanguage')).toBe('fr');
    expect(settings.get('explanationLanguage')).toBe('de');
  });

  it('all three language keys can be set to different values simultaneously', async () => {
    await simulateRestart();
    await Promise.all([
      settings.set('uiLanguage', 'uk'),
      settings.set('contentLanguage', 'en'),
      settings.set('explanationLanguage', 'fr'),
    ]);
    expect(settings.get('uiLanguage')).toBe('uk');
    expect(settings.get('contentLanguage')).toBe('en');
    expect(settings.get('explanationLanguage')).toBe('fr');
  });
});

// ---------------------------------------------------------------------------
// (e) Logical clock is strictly increasing across simulated restarts
// ---------------------------------------------------------------------------

describe('Logical clock — nextSeq()', () => {
  it('nextSeq() returns strictly increasing values within a session', async () => {
    await simulateRestart();
    const s1 = await nextSeq();
    const s2 = await nextSeq();
    const s3 = await nextSeq();
    expect(s1).toBe(1);
    expect(s2).toBe(2);
    expect(s3).toBe(3);
  });

  it('nextSeq() persists the high-water mark so a re-hydration resumes from there', async () => {
    await simulateRestart();
    await nextSeq(); // seq = 1
    await nextSeq(); // seq = 2
    const s3 = await nextSeq(); // seq = 3
    expect(s3).toBe(3);
    // Simulate restart
    await simulateRestart();
    const s4 = await nextSeq(); // must resume at 4, not restart at 1
    expect(s4).toBe(4);
  });

  it('nextSeq() starts at 1 on a fresh install (logicalSeq default = 0)', async () => {
    await simulateRestart();
    const first = await nextSeq();
    expect(first).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (f) & (g) Device id is stable across re-hydration and minted only once
// ---------------------------------------------------------------------------

describe('Device id — getDeviceId()', () => {
  it('returns a non-empty string', async () => {
    await simulateRestart();
    const id = await getDeviceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns the same id across multiple calls within a session', async () => {
    await simulateRestart();
    const id1 = await getDeviceId();
    const id2 = await getDeviceId();
    const id3 = await getDeviceId();
    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it('is stable across simulated restarts (re-hydration)', async () => {
    await simulateRestart();
    const id1 = await getDeviceId();
    // Simulate restart
    await simulateRestart();
    const id2 = await getDeviceId();
    expect(id1).toBe(id2);
  });

  it('persists the device id to the settings table so it survives re-hydration', async () => {
    await simulateRestart();
    const id1 = await getDeviceId();
    // After minting, the id should be in the cache
    expect(settings.get('deviceId')).toBe(id1);
    // Simulate restart
    await simulateRestart();
    // After re-hydration, the cache should have the same id
    expect(settings.get('deviceId')).toBe(id1);
  });
});
