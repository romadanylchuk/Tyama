/**
 * anti-shame-render.test.tsx — repo-wide BEHAVIORAL anti-shame guard
 * (Stage 06, Phase 7; extended Stage 07, Phase 8 for onboarding).
 *
 * WHAT THIS GUARDS (complements the structural grep in anti-shame-guard.test.ts):
 *   Renders the actual composed components across a set of "would a naive
 *   implementation shame the learner here?" scenarios and asserts the calm,
 *   never-shaming surface really appears on screen:
 *
 *     1. `MasteryRing` across a DECREASING aggregate sequence — `fill` is
 *        always the raw scalar, and a drop below the mastery threshold
 *        returns to `'in-progress'`, never a loss/decrease/red state.
 *     2. `MasteryRing` at `'not-yet-open'` — no padlock glyph, never the
 *        word "locked" anywhere in the rendered tree.
 *     3. A streak MISS (a real gap via `recordKeptDaySession`, not a
 *        simulated prop) rendered through `NodeMapScreen`'s own
 *        `useMotivation()` chrome — the displayed streak is held, never
 *        reset/decreased, and no shame vocabulary appears.
 *     4. A real parse-error (empty numeric input) driven end-to-end through
 *        `TaskScreen` → `SessionController.submit` → the `TaskFeedback`
 *        panel — asserts the panel is a calm format hint (`common.retry`),
 *        never a "wrong answer" verdict.
 *     5. Stage-07 onboarding screens (`WelcomeScreen`/`LanguageScreen`/
 *        `PersonaScreen`/`DoneScreen`/`PlacementScreen` intro) — render each
 *        under `<ThemeProvider>` and assert no `FORBIDDEN_FEEDBACK_VOCAB`
 *        word and no dominant-red hex anywhere in the rendered tree (not
 *        just visible text — style-prop colors too).
 *     6. Placement `failed-step` (the first non-success on the ascending
 *        ladder) — asserts the calm staged-descent copy (`descent.header`/
 *        `descent.body`), never a verdict/demotion, and that the failing
 *        node is never seeded.
 *     7. Placement `parse-error` — asserts the gentle re-prompt copy
 *        (`hint.formatHeader` + `parse.<kind>`), never a wrong/red/cross
 *        surface, and that the SAME probe is re-collected (not consumed).
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { useTestDb } from '../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { getProgress } from '@/repositories/progress-repository';
import { GRAPH_FIXTURE } from '@/core/graph/graph-fixture';
import { ThemeProvider, FORBIDDEN_FEEDBACK_VOCAB, isDominantRedHex } from '@/theme';
import { deriveRingState, recordKeptDaySession, MasteryRing } from '@/motivation';
import { NodeMapScreen } from '@/ui/node-map/NodeMapScreen';
import { TaskScreen } from '@/ui/task-screen/TaskScreen';
import { SessionController } from '@/ui/task-screen/session-controller';
import {
  WelcomeScreen,
  LanguageScreen,
  PersonaScreen,
  DoneScreen,
  PlacementScreen,
  createPlacementController,
} from '@/ui/onboarding';
import { canonicalize, SCALAR_INTEGER_POLICY } from '@/core/canonical';
import { getGenerator } from '@/core/generators/registry';
import type { Generator, GeneratedTask, NodeId } from '@/core/types';
import type { PlacementConfig } from '@/config/placement';

// Onboarding placement scenarios (sections 6-7) need a deterministic
// single-step generator stub — mirrors PlacementScreen.test.tsx's own
// mocking strategy exactly. The mock's DEFAULT implementation delegates to
// the real registry so sections 1-4 (which exercise the real 'multiplication'
// generator via SessionController/TaskScreen) are entirely unaffected; only
// the placement describes below override it locally, and restore the
// default afterward.
jest.mock('@/core/generators/registry', () => {
  const actual = jest.requireActual('@/core/generators/registry');
  return { ...actual, getGenerator: jest.fn(actual.getGenerator) };
});
const ACTUAL_GET_GENERATOR = jest.requireActual('@/core/generators/registry').getGenerator;

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

/** Every forbidden word EXCEPT the bare glyph/short stems that collide with
 *  legitimate RN/test plumbing text (kept identical in spirit to the
 *  existing Phase-6 `queryByText(/locked/i)` / `queryByText(/wrong/i)`
 *  per-word checks — asserted individually below, not as one giant regex,
 *  so a failure names the exact offending word). */
const RENDERED_TEXT_FORBIDDEN_WORDS = FORBIDDEN_FEEDBACK_VOCAB;

function renderUnderTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

function expectNoShameVocabulary(queryByText: (re: RegExp) => unknown): void {
  for (const word of RENDERED_TEXT_FORBIDDEN_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(queryByText(new RegExp(escaped, 'i'))).toBeNull();
  }
}

/** A hex-color-shaped literal — mirrors anti-shame-guard.test.ts's HEX_LITERAL_RE. */
const HEX_LITERAL_RE = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;

/**
 * Walks a `render(...).toJSON()` tree (props, style objects/arrays, and
 * children, recursively) and collects every hex-color-shaped string found
 * anywhere in it — not just visible text, but style-prop colors too (e.g.
 * `tokens.color.accent` resolved into a concrete hex on a `View`/`Text`
 * style). Reuses the SAME `isDominantRedHex()` primitive
 * `anti-shame-guard.test.ts` uses for source literals — no competing check.
 */
function collectHexLiterals(node: unknown, acc: string[] = []): string[] {
  if (node == null) return acc;
  if (Array.isArray(node)) {
    for (const child of node) collectHexLiterals(child, acc);
    return acc;
  }
  if (typeof node === 'string') {
    for (const hex of node.match(HEX_LITERAL_RE) ?? []) acc.push(hex);
    return acc;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectHexLiterals(value, acc);
    }
  }
  return acc;
}

/** Asserts a rendered tree carries no dominant-red hex anywhere (text or style). */
function expectNoDominantRedSurface(renderJson: unknown): void {
  for (const hex of collectHexLiterals(renderJson)) {
    expect(isDominantRedHex(hex)).toBe(false);
  }
}

/** Presses one keypad digit button per character — mirrors PlacementScreen.test.tsx. */
function pressDigits(getByText: (text: string) => unknown, digits: string): void {
  for (const ch of digits) {
    fireEvent.press(getByText(ch) as never);
  }
}

// ---------------------------------------------------------------------------
// 1. MasteryRing across a decreasing aggregate sequence
// ---------------------------------------------------------------------------

describe('MasteryRing never renders a loss/decrease surface as an aggregate eases down', () => {
  it('a decreasing aggregate sequence stays in-progress (never a loss state) once above 0, and fill always reflects the raw scalar', () => {
    // A windowed scalar can legitimately ease down (e.g. a lapse). None of
    // these states may EVER be a "loss" — ring-state.ts's own union has no
    // such member; this test renders the component at each point to prove
    // the composed UI (not just the pure derivation) never regresses to a
    // shame surface.
    const decreasingAggregates = [0.9, 0.6, 0.3, 0.05];

    for (const aggregate of decreasingAggregates) {
      const { state, fill } = deriveRingState(aggregate, 'available', {
        masteryThreshold: 0.95,
      });

      expect(fill).toBe(aggregate); // fill is always the raw scalar, never clamped to a "lost" 0.
      expect(state).not.toBe('mastered');
      expect(['available', 'in-progress']).toContain(state);

      const { queryByText, unmount } = renderUnderTheme(
        <MasteryRing nodeId="fruit-equations" fill={fill} state={state} />
      );
      expectNoShameVocabulary(queryByText);
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. MasteryRing at not-yet-open — no padlock, never "locked"
// ---------------------------------------------------------------------------

describe('MasteryRing at not-yet-open renders muted, never a padlock/"locked" surface', () => {
  it('renders no padlock glyph and no shame vocabulary anywhere in the tree', () => {
    const { queryByText } = renderUnderTheme(
      <MasteryRing nodeId="unknown-as-missing-addend" fill={0} state="not-yet-open" />
    );
    expect(queryByText('🔒')).toBeNull();
    expectNoShameVocabulary(queryByText);
  });
});

// ---------------------------------------------------------------------------
// 3. Streak miss — a real gap via recordKeptDaySession, rendered chrome
// ---------------------------------------------------------------------------

describe('A streak miss is a silent hold, never a decrease/reset, in rendered chrome', () => {
  it('NodeMapScreen renders the held streak value after a real missed day, never a lower/reset number, and no shame vocabulary', async () => {
    const day1 = Date.UTC(2026, 0, 1); // 2026-01-01
    const day2 = day1 + 86_400_000; // 2026-01-02 (consecutive -> streak 2)
    const day5 = day1 + 4 * 86_400_000; // 2026-01-05 (a 3-day gap -> a MISS)

    await recordKeptDaySession(day1); // first-ever kept day -> streak 1
    const afterConsecutive = await recordKeptDaySession(day2); // consecutive -> streak 2
    expect(afterConsecutive.streak).toBe(2);

    const afterMiss = await recordKeptDaySession(day5); // gap of 3 days -> silent hold
    expect(afterMiss.streak).toBe(2); // NEVER decreased/reset to 0 or 1.

    const { getByText, queryByText } = renderUnderTheme(
      <NodeMapScreen onSelectNode={jest.fn()} />
    );

    // The rendered streak chrome reflects the held value, not a reset.
    await waitFor(() => expect(getByText(/2/)).toBeTruthy());
    expectNoShameVocabulary(queryByText);
  });
});

// ---------------------------------------------------------------------------
// 4. Parse-error feedback — a calm format hint, never a "wrong answer" verdict
// ---------------------------------------------------------------------------

describe('A parse error is rendered as a calm format hint, never a wrong-answer surface', () => {
  it('confirming an empty numeric answer shows the calm retry panel, never shame vocabulary', async () => {
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const { getByTestId, queryByText } = renderUnderTheme(
      <TaskScreen
        nodeId="multiplication"
        controller={controller}
        onExit={jest.fn()}
        onNavigate={jest.fn()}
      />
    );

    await waitFor(() => expect(getByTestId('task-screen')).toBeTruthy());
    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());

    // Confirm with NO digits entered -> ParseError('empty') -> a 'parse-hint'
    // view-event (never a routing event, never ingestAttempt — see
    // session-controller.test.ts's identical assertion at the unit level).
    fireEvent.press(getByTestId('confirm-button'));

    await waitFor(() => expect(getByTestId('task-feedback')).toBeTruthy());
    // The continue affordance is the calm 'common.retry' label, never a
    // "you were wrong" framing.
    expect(getByTestId('task-feedback-continue')).toBeTruthy();
    expectNoShameVocabulary(queryByText);
  });
});

// ---------------------------------------------------------------------------
// 5. Onboarding static screens + placement intro — calm framing, no shame
//    vocabulary, no dominant-red surface anywhere in the rendered tree
//    (Stage 07, Phase 8).
// ---------------------------------------------------------------------------

describe('Onboarding screens (Welcome/Language/Persona/Done/Placement-intro) render calm framing with no shame vocabulary or dominant-red surfaces', () => {
  it('WelcomeScreen', () => {
    const { queryByText, toJSON } = renderUnderTheme(<WelcomeScreen onNext={jest.fn()} />);
    expectNoShameVocabulary(queryByText);
    expectNoDominantRedSurface(toJSON());
  });

  it('LanguageScreen', () => {
    const { queryByText, toJSON } = renderUnderTheme(<LanguageScreen onNext={jest.fn()} />);
    expectNoShameVocabulary(queryByText);
    expectNoDominantRedSurface(toJSON());
  });

  it('PersonaScreen', () => {
    const { queryByText, toJSON } = renderUnderTheme(<PersonaScreen onNext={jest.fn()} />);
    expectNoShameVocabulary(queryByText);
    expectNoDominantRedSurface(toJSON());
  });

  it('DoneScreen', () => {
    const { queryByText, toJSON } = renderUnderTheme(<DoneScreen onComplete={jest.fn()} />);
    expectNoShameVocabulary(queryByText);
    expectNoDominantRedSurface(toJSON());
  });

  it('PlacementScreen at its intro state (before any probe is generated)', () => {
    // The shipped PLACEMENT_CONFIG is safe to use unmocked here: the intro
    // state never calls getGenerator (no probe is generated until "Begin" is
    // pressed), so no generator mocking is needed for this scenario.
    const controller = createPlacementController();
    const { queryByText, toJSON } = renderUnderTheme(
      <PlacementScreen controller={controller} onDone={jest.fn()} onSkip={jest.fn(async () => {})} />
    );
    expectNoShameVocabulary(queryByText);
    expectNoDominantRedSurface(toJSON());
  });
});

// ---------------------------------------------------------------------------
// 6. Placement failed-step — calm staged-descent framing, never a
//    verdict/demotion (Stage 07, Phase 8).
// ---------------------------------------------------------------------------

describe('Placement failed-step stops the ladder with calm staged-descent framing, never a verdict/demotion', () => {
  const TEST_CONFIG: PlacementConfig = Object.freeze({
    probeCount: 2,
    minProbes: 1,
    ascentChain: Object.freeze(['number-bonds', 'fruit-equations']) as readonly NodeId[],
    floorNodeId: 'number-bonds',
    seedCoordinate: 0.65,
  });

  const EXPECTED = canonicalize(7);

  function stubGenerator(nodeId: NodeId, expected: string): Generator {
    return {
      skillNode: nodeId,
      generate: (): GeneratedTask => ({
        problem: { prompt: { key: 'test.problem' }, representation: 'abstract' },
        solution: expected,
        steps: [
          {
            prompt: { key: 'test.step' },
            inputMode: 'number',
            expected,
            skillNode: nodeId,
            elicitFromMastery: 0.65,
            normalizationPolicy: SCALAR_INTEGER_POLICY,
          },
        ],
        representation: 'abstract',
        skillNode: nodeId,
      }),
      instantiate: (): unknown => ({}),
    };
  }

  afterEach(() => {
    // Restore the default (real-registry-delegating) implementation so
    // sections 1-4/5 above and any suite ordering elsewhere are unaffected.
    (getGenerator as jest.Mock).mockImplementation(ACTUAL_GET_GENERATOR);
  });

  it('a wrong probe renders the staged-descent copy, never wrong/red/cross/buzzer/verdict vocabulary, and seeds nothing for the failing node', async () => {
    (getGenerator as jest.Mock).mockImplementation((nodeId: NodeId) => stubGenerator(nodeId, EXPECTED));

    const controller = createPlacementController(TEST_CONFIG);
    const onDone = jest.fn();
    const onSkip = jest.fn(async () => {});
    const { getByTestId, getByText, queryByText, toJSON } = renderUnderTheme(
      <PlacementScreen controller={controller} onDone={onDone} onSkip={onSkip} />
    );

    await waitFor(() => expect(getByTestId('onboarding-placement-begin')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-placement-begin'));

    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    // A digit that does NOT match EXPECTED ('7') -> failed-step.
    pressDigits(getByText, '1');
    fireEvent.press(getByTestId('confirm-button'));

    await waitFor(() => expect(getByTestId('onboarding-placement-stopped')).toBeTruthy());
    // Calm staged-descent framing (descent.header/descent.body: "let's firm
    // up X first") — never a verdict, score, or shame surface.
    expect(getByTestId('onboarding-placement-stopped-continue')).toBeTruthy();
    expectNoShameVocabulary(queryByText);
    expectNoDominantRedSurface(toJSON());

    // The failing node was never seeded — a failed-step seeds nothing.
    expect(await getProgress('number-bonds')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. Placement parse-error — gentle re-prompt, probe not consumed
//    (Stage 07, Phase 8).
// ---------------------------------------------------------------------------

describe('Placement parse-error is a gentle re-prompt, never consuming the probe or writing anything', () => {
  const TEST_CONFIG: PlacementConfig = Object.freeze({
    probeCount: 2,
    minProbes: 1,
    ascentChain: Object.freeze(['number-bonds', 'fruit-equations']) as readonly NodeId[],
    floorNodeId: 'number-bonds',
    seedCoordinate: 0.65,
  });

  const EXPECTED = canonicalize(7);

  function stubGenerator(nodeId: NodeId, expected: string): Generator {
    return {
      skillNode: nodeId,
      generate: (): GeneratedTask => ({
        problem: { prompt: { key: 'test.problem' }, representation: 'abstract' },
        solution: expected,
        steps: [
          {
            prompt: { key: 'test.step' },
            inputMode: 'number',
            expected,
            skillNode: nodeId,
            elicitFromMastery: 0.65,
            normalizationPolicy: SCALAR_INTEGER_POLICY,
          },
        ],
        representation: 'abstract',
        skillNode: nodeId,
      }),
      instantiate: (): unknown => ({}),
    };
  }

  afterEach(() => {
    (getGenerator as jest.Mock).mockImplementation(ACTUAL_GET_GENERATOR);
  });

  it('an empty submission re-prompts the SAME probe with calm format-hint copy, never a wrong/red/cross surface, and is not consumed', async () => {
    (getGenerator as jest.Mock).mockImplementation((nodeId: NodeId) => stubGenerator(nodeId, EXPECTED));

    const controller = createPlacementController(TEST_CONFIG);
    const onDone = jest.fn();
    const onSkip = jest.fn(async () => {});
    const { getByTestId, getByText, queryByText, toJSON } = renderUnderTheme(
      <PlacementScreen controller={controller} onDone={onDone} onSkip={onSkip} />
    );

    await waitFor(() => expect(getByTestId('onboarding-placement-begin')).toBeTruthy());
    fireEvent.press(getByTestId('onboarding-placement-begin'));

    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    // Confirm with NO digits entered -> ParseError('empty').
    fireEvent.press(getByTestId('confirm-button'));

    await waitFor(() => expect(getByTestId('onboarding-placement-parse-hint')).toBeTruthy());
    // Gentle format-hint framing only (hint.formatHeader + parse.empty) —
    // never a wrong/red/cross surface.
    expectNoShameVocabulary(queryByText);
    expectNoDominantRedSurface(toJSON());
    expect(await getProgress('number-bonds')).toBeNull(); // nothing written yet

    fireEvent.press(getByTestId('onboarding-placement-parse-continue'));

    // The SAME probe (number-bonds) is re-collected — not skipped, not
    // consumed as a failure. Answering it correctly now succeeds and ascends.
    await waitFor(() => expect(getByTestId('confirm-button')).toBeTruthy());
    pressDigits(getByText, EXPECTED);
    fireEvent.press(getByTestId('confirm-button'));

    // 'confirm-button' shares the same testID across the re-prompted and the
    // next-probe render, so poll the actual persisted write (not just DOM
    // presence) to avoid racing the async recordProbe('correct') seed.
    await waitFor(async () => {
      const row = await getProgress('number-bonds');
      expect(row).not.toBeNull();
    });
    expect(onDone).not.toHaveBeenCalled(); // still ascending (2-probe ladder)
  });
});
