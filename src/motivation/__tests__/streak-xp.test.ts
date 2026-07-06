/**
 * streak-xp.test.ts — Pure streak/XP derivation + emission-wrapper tests
 * (Stage 06, Phase 4).
 *
 * Covers the Phase 4 completion criterion:
 *   - A miss never produces a decrease; XP is strictly non-decreasing and
 *     never deducts.
 *   - `recordKeptDaySession`/`awardXp` persist ONLY via `upsertNonMilestoneProgress`
 *     + `appendFirehose` + `recordMilestone` — no new durable writer.
 *   - `recordKeptDaySession` is idempotent within the same calendar day.
 *   - The very first kept day fires `'first_streak_reached'` exactly once.
 */

import { useTestDb } from '../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { getProgress } from '@/repositories/progress-repository';
import { readDurableSince, readAllFirehose } from '@/repositories/events-repository';
import {
  GLOBAL_MOTIVATION_NODE_ID,
  computeStreakDisplay,
  nextXp,
  recordKeptDaySession,
  awardXp,
  awardTaskCompletionXp,
  awardMasteryMilestoneXp,
} from '../streak-xp';
import { XP_AWARDS } from '../motivation-config';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

// ---------------------------------------------------------------------------
// computeStreakDisplay — pure
// ---------------------------------------------------------------------------

describe('computeStreakDisplay', () => {
  it('first-ever kept day (lastSessionDay null) increments from 0', () => {
    expect(computeStreakDisplay(0, null, '2026-07-06')).toBe(1);
  });

  it('already counted today (same day) holds — no double count', () => {
    expect(computeStreakDisplay(3, '2026-07-06', '2026-07-06')).toBe(3);
  });

  it('a consecutive kept day (exactly one day gap) increments', () => {
    expect(computeStreakDisplay(3, '2026-07-05', '2026-07-06')).toBe(4);
  });

  it('a missed day (gap > 1) is a SILENT HOLD — never a decrease, never reset to 0/1', () => {
    // 5 days elapsed with no session in between — a real miss.
    expect(computeStreakDisplay(7, '2026-07-01', '2026-07-06')).toBe(7);
  });

  it('a large streak never regresses across an arbitrarily long miss', () => {
    expect(computeStreakDisplay(42, '2026-01-01', '2026-07-06')).toBe(42);
  });

  it('never returns a value lower than currentStreak for any gap', () => {
    const currentStreak = 10;
    for (const gap of [0, 1, 2, 5, 30, 365]) {
      const today = '2026-07-06';
      const fromMs = Date.parse(`${today}T00:00:00.000Z`) - gap * 86_400_000;
      const lastSessionDay = new Date(fromMs).toISOString().slice(0, 10);
      const result = computeStreakDisplay(currentStreak, lastSessionDay, today);
      expect(result).toBeGreaterThanOrEqual(currentStreak);
    }
  });
});

// ---------------------------------------------------------------------------
// nextXp — pure, strictly non-decreasing
// ---------------------------------------------------------------------------

describe('nextXp', () => {
  it('adds a positive award', () => {
    expect(nextXp(100, 10)).toBe(110);
  });

  it('never deducts — a negative award is floored at 0 contribution', () => {
    expect(nextXp(100, -50)).toBe(100);
  });

  it('is strictly non-decreasing across a sequence of awards', () => {
    let xp = 0;
    const awards = [10, 0, 50, -5, 10];
    for (const award of awards) {
      const next = nextXp(xp, award);
      expect(next).toBeGreaterThanOrEqual(xp);
      xp = next;
    }
    expect(xp).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// recordKeptDaySession — emission wrapper (DB-backed)
// ---------------------------------------------------------------------------

describe('recordKeptDaySession', () => {
  it('persists streak=1 and fires first_streak_reached on the very first kept day', async () => {
    const nowMs = Date.parse('2026-07-06T10:00:00.000Z');
    const result = await recordKeptDaySession(nowMs);

    expect(result.streak).toBe(1);
    expect(result.isFirstKeptDay).toBe(true);

    const row = await getProgress(GLOBAL_MOTIVATION_NODE_ID);
    expect(row).not.toBeNull();
    expect(row!.streak).toBe(1);

    const durableEvents = await readDurableSince(0);
    expect(durableEvents).toHaveLength(1);
    expect(durableEvents[0].kind).toBe('first_streak_reached');

    const firehoseEvents = await readAllFirehose();
    expect(firehoseEvents.some((e) => e.type === 'streak_kept_day')).toBe(true);
  });

  it('is idempotent within the same calendar day — no duplicate write or event', async () => {
    const day1 = Date.parse('2026-07-06T09:00:00.000Z');
    const day1Later = Date.parse('2026-07-06T21:00:00.000Z');

    await recordKeptDaySession(day1);
    const second = await recordKeptDaySession(day1Later);

    expect(second.streak).toBe(1);
    expect(second.isFirstKeptDay).toBe(false);

    // Only ONE firehose 'streak_kept_day' event and one durable milestone —
    // the second same-day call is a silent no-op.
    const firehoseEvents = await readAllFirehose();
    expect(firehoseEvents.filter((e) => e.type === 'streak_kept_day')).toHaveLength(1);

    const durableEvents = await readDurableSince(0);
    expect(durableEvents).toHaveLength(1);
  });

  it('increments on a consecutive-day session and does NOT re-fire first_streak_reached', async () => {
    await recordKeptDaySession(Date.parse('2026-07-05T10:00:00.000Z'));
    const second = await recordKeptDaySession(Date.parse('2026-07-06T10:00:00.000Z'));

    expect(second.streak).toBe(2);
    expect(second.isFirstKeptDay).toBe(false);

    const durableEvents = await readDurableSince(0);
    expect(durableEvents).toHaveLength(1); // still only the first-ever milestone
  });

  it('a missed day silently holds the streak (no decrease) and never re-fires the milestone', async () => {
    await recordKeptDaySession(Date.parse('2026-07-01T10:00:00.000Z'));
    // A 5-day gap — a real miss.
    const afterMiss = await recordKeptDaySession(Date.parse('2026-07-06T10:00:00.000Z'));

    expect(afterMiss.streak).toBe(1); // held, not decreased, not reset below 1
    expect(afterMiss.isFirstKeptDay).toBe(false);

    const durableEvents = await readDurableSince(0);
    expect(durableEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// awardXp / awardTaskCompletionXp / awardMasteryMilestoneXp — emission wrappers
// ---------------------------------------------------------------------------

describe('awardXp', () => {
  it('persists xp via upsertNonMilestoneProgress and appends a firehose event', async () => {
    const xp = await awardXp(25);
    expect(xp).toBe(25);

    const row = await getProgress(GLOBAL_MOTIVATION_NODE_ID);
    expect(row!.xp).toBe(25);

    const firehoseEvents = await readAllFirehose();
    expect(firehoseEvents.some((e) => e.type === 'xp_awarded')).toBe(true);

    // XP is never a milestone-durable event.
    const durableEvents = await readDurableSince(0);
    expect(durableEvents).toHaveLength(0);
  });

  it('accumulates across multiple awards — never deducts', async () => {
    await awardXp(10);
    const total = await awardXp(15);
    expect(total).toBe(25);
  });

  it('awardTaskCompletionXp uses the config-as-data taskCompletion amount', async () => {
    const xp = await awardTaskCompletionXp();
    expect(xp).toBe(XP_AWARDS.taskCompletion);
  });

  it('awardMasteryMilestoneXp uses the config-as-data masteryMilestone amount', async () => {
    const xp = await awardMasteryMilestoneXp();
    expect(xp).toBe(XP_AWARDS.masteryMilestone);
  });

  it('does not touch mastery_level on the sentinel row (never a milestone-state writer)', async () => {
    await awardXp(10);
    const row = await getProgress(GLOBAL_MOTIVATION_NODE_ID);
    expect(row!.masteryLevel).toBe(0);
  });
});
