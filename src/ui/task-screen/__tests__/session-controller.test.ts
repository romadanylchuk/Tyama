/**
 * session-controller.test.ts — SessionController.submit() orchestration tests
 * (Stage 06, Phase 6).
 *
 * Covers the Phase 6 completion criterion for session-controller.ts:
 *   - parse-error -> 'parse-hint' view-event; NO ingestAttempt/route call
 *     (proven by the target node's progress row remaining absent).
 *   - correct -> ingestAttempt + XP award + first-kept-day streak; diagnostic
 *     debt is never set for a correct outcome.
 *   - failed-step (no tie, single unmastered prerequisite) -> ingest + route
 *     + a 'staged-descent' view-event; the routed-to target becomes this
 *     session's diagnostic debt.
 *   - A second failure AT the just-routed-to target (a root node with no
 *     further prerequisites) triggers route()'s own anti-loop escalation ->
 *     a 'escalation' view-event; the injected ExplanationProvider receives a
 *     correctly-shaped ExplanationRequestContext (split content/explanation
 *     languages, priorApproach present).
 *   - A correct outcome for a node clears that node's diagnostic debt.
 *   - NO view-event kind is ever a shame surface (structural vocabulary check).
 */

import { useTestDb } from '../../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { getProgress, upsertNonMilestoneProgress } from '@/repositories/progress-repository';
import { GRAPH_FIXTURE } from '@/core/graph/graph-fixture';
import { SCALAR_DECIMAL_POLICY, SCALAR_INTEGER_POLICY } from '@/core/canonical';
import { resolveLocaleProfile } from '@/parsing';
import type { GeneratedTask, GraphDefinition, Step } from '@/core/types';
import type { WidgetOutput } from '@/widgets';
import { XP_AWARDS, GLOBAL_MOTIVATION_NODE_ID } from '@/motivation';
import type { ExplanationProvider, ExplanationRequestContext, ExplanationResult } from '@/explanation';
import { SessionController } from '../session-controller';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

const UK_PROFILE = resolveLocaleProfile('uk');

function makeStep(overrides: Partial<Step> & Pick<Step, 'skillNode' | 'expected'>): Step {
  return {
    prompt: { key: 'test.step' },
    inputMode: 'number',
    normalizationPolicy: SCALAR_DECIMAL_POLICY,
    elicitFromMastery: 0.2,
    ...overrides,
  };
}

function makeTask(steps: Step[]): GeneratedTask {
  return {
    problem: { prompt: { key: 'test.problem' }, representation: 'pictorial' },
    solution: steps[steps.length - 1].expected,
    steps,
    representation: 'pictorial',
    skillNode: steps[0].skillNode,
  };
}

async function markMastered(nodeId: string): Promise<void> {
  await upsertNonMilestoneProgress({
    nodeId,
    metrics: JSON.stringify({
      mastery: { slices: { abstract: { window: [1], scalar: 1 } }, aggregate: 1 },
    }),
  });
}

/**
 * A minimal band ladder shared by the synthetic GHOST_GRAPH nodes below —
 * the exact band shape does not matter for these tests (SessionController
 * never generates a task off this graph; it only reads `prerequisites` for
 * `route()` and node ids for `buildMasteryLookup()`).
 */
const STUB_BANDS = [{ minCoordinate: 0, representationLevel: 'concrete', params: {} }] as const;

/**
 * GHOST_GRAPH — a custom 3-node graph for the UNPRACTICEABLE-target test below.
 *
 * Every real fixture node is now generator-backed (registry.ts registers
 * `addition-within-20` and `unknown-as-missing-addend`), so GRAPH_FIXTURE no
 * longer has a 'coming-soon' node to route to. `ghost-foundation` is a
 * synthetic node id that exists ONLY in this test graph and has NO entry in
 * the real `GENERATORS` registry — `hasGenerator('ghost-foundation')` is
 * structurally `false`, reproducing the "routed-to a generator-less target"
 * scenario without mocking the registry module.
 */
const GHOST_GRAPH: GraphDefinition = {
  graphVersion: 'test-only',
  nodes: [
    {
      id: 'ghost-foundation',
      prerequisites: [],
      representationLevels: ['concrete'],
      difficultyHooks: { bands: [...STUB_BANDS] },
    },
    {
      id: 'unknown-as-missing-addend',
      prerequisites: ['ghost-foundation'],
      representationLevels: ['pictorial'],
      difficultyHooks: { bands: [...STUB_BANDS] },
    },
    {
      id: 'fruit-equations',
      prerequisites: ['ghost-foundation', 'unknown-as-missing-addend'],
      representationLevels: ['pictorial'],
      difficultyHooks: { bands: [...STUB_BANDS] },
    },
  ],
};

describe('SessionController.submit', () => {
  it("parse-error: returns a 'parse-hint' view-event and never calls ingestAttempt/route", async () => {
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const step = makeStep({ skillNode: 'fruit-equations', expected: '5' });
    const task = makeTask([step]);
    const outputs: WidgetOutput[] = [{ rawInput: '' }]; // empty -> ParseError('empty')

    const event = await controller.submit({
      task,
      outputs,
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'uk',
    });

    expect(event.kind).toBe('parse-hint');
    if (event.kind === 'parse-hint') {
      expect(event.error.kind).toBe('empty');
    }
    // No ingestAttempt call: the task's skillNode never gets a progress row.
    expect(await getProgress('fruit-equations')).toBeNull();
  });

  it('correct: awards task-completion XP, records the first kept day, never sets diagnostic debt', async () => {
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const step = makeStep({ skillNode: 'fruit-equations', expected: '5' });
    const task = makeTask([step]);
    const outputs: WidgetOutput[] = [{ rawInput: '5' }];

    const event = await controller.submit({
      task,
      outputs,
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'uk',
    });

    expect(event.kind).toBe('correct');
    if (event.kind === 'correct') {
      expect(event.xpAwarded).toBe(XP_AWARDS.taskCompletion);
    }
    expect(controller.getCompletedTaskCount()).toBe(1);
    expect(controller.getDiagnosticDebt()).toBeNull();

    const motivationRow = await getProgress(GLOBAL_MOTIVATION_NODE_ID);
    expect(motivationRow?.streak).toBe(1);
    expect(motivationRow?.xp).toBe(XP_AWARDS.taskCompletion);
  });

  it("failed-step routed to a PRACTICABLE target: 'staged-descent' + diagnostic debt", async () => {
    // Master both roots so fraction-simplification's descent stops at
    // fruit-equations — an unmastered prerequisite that HAS a generator.
    await markMastered('addition-within-20');
    await markMastered('unknown-as-missing-addend');

    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const step = makeStep({
      skillNode: 'fraction-simplification',
      expected: '5',
      normalizationPolicy: SCALAR_INTEGER_POLICY,
    });
    const task = makeTask([step]);
    const outputs: WidgetOutput[] = [{ rawInput: '9' }]; // wrong answer -> failed-step

    const event = await controller.submit({
      task,
      outputs,
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'uk',
    });

    expect(event.kind).toBe('staged-descent');
    if (event.kind === 'staged-descent') {
      expect(event.target).toBe('fruit-equations');
      expect(event.reason).toBe('deepest-unmastered');
      expect(event.descentPath).toEqual(['fraction-simplification', 'fruit-equations']);
    }
    expect(controller.getDiagnosticDebt()).toBe('fruit-equations');

    // ingestAttempt DID persist a progress row for the failed node.
    expect(await getProgress('fraction-simplification')).not.toBeNull();
  });

  it("failed-step routed to an UNPRACTICEABLE (coming-soon) target: escalates to the explanation provider instead of dead-ending", async () => {
    // GHOST_GRAPH's 'ghost-foundation' is a synthetic prerequisite with NO
    // registered generator (unlike every node in the real GRAPH_FIXTURE, which
    // is now fully generator-backed). Seed 'unknown-as-missing-addend' as
    // mastered so fruit-equations' descent has exactly ONE unmastered
    // prerequisite: 'ghost-foundation'. Navigating there would strand the
    // learner on the coming-soon panel on EVERY wrong answer (and the
    // anti-loop escalation could never fire, since it requires a second
    // failure AT that node).
    await markMastered('unknown-as-missing-addend');

    const explainCalls: ExplanationRequestContext[] = [];
    const fakeProvider: ExplanationProvider = {
      async explain(ctx: ExplanationRequestContext): Promise<ExplanationResult> {
        explainCalls.push(ctx);
        return { kind: 'clipboard', promptText: 'fake prompt', status: 'copied' };
      },
    };
    const controller = new SessionController({ graph: GHOST_GRAPH, explanationProvider: fakeProvider });
    const step = makeStep({ skillNode: 'fruit-equations', expected: '5' });
    const event = await controller.submit({
      task: makeTask([step]),
      outputs: [{ rawInput: '9' }],
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'uk',
    });

    expect(event.kind).toBe('escalation');
    if (event.kind === 'escalation') {
      expect(event.result.status).toBe('copied');
      expect(event.target).toBe('ghost-foundation');
    }
    expect(explainCalls).toHaveLength(1);
    // An unpracticeable target is never diagnostic debt — whereToNext could
    // only propose a node the learner cannot open.
    expect(controller.getDiagnosticDebt()).toBeNull();
  });

  it('a second failure at the just-routed-to root node triggers escalation via the injected ExplanationProvider', async () => {
    await markMastered('unknown-as-missing-addend');

    const explainCalls: ExplanationRequestContext[] = [];
    const fakeProvider: ExplanationProvider = {
      async explain(ctx: ExplanationRequestContext): Promise<ExplanationResult> {
        explainCalls.push(ctx);
        return { kind: 'clipboard', promptText: 'fake prompt', status: 'copied' };
      },
    };
    const controller = new SessionController({ graph: GRAPH_FIXTURE, explanationProvider: fakeProvider });

    // First failure at fruit-equations -> routes to addition-within-20. Every
    // GRAPH_FIXTURE node is now generator-backed, so this is a genuine
    // 'staged-descent' (not an escalation) — but it STILL records the
    // anti-loop visit on the target, which is what the second failure below
    // depends on.
    const step1 = makeStep({ skillNode: 'fruit-equations', expected: '5' });
    const task1 = makeTask([step1]);
    const event1 = await controller.submit({
      task: task1,
      outputs: [{ rawInput: '9' }],
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'uk',
    });
    expect(event1.kind).toBe('staged-descent');
    if (event1.kind === 'staged-descent') {
      expect(event1.target).toBe('addition-within-20');
    }
    expect(explainCalls).toHaveLength(0);

    // Second failure -- now directly AT addition-within-20 (a root node with
    // no further prerequisites) -- route()'s own anti-loop escalates (the
    // node was already visited once above), and the context carries
    // priorApproach (what was already tried).
    const step2 = makeStep({ skillNode: 'addition-within-20', expected: '3' });
    const task2 = makeTask([step2]);
    const event2 = await controller.submit({
      task: task2,
      outputs: [{ rawInput: '9' }],
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'en',
    });

    expect(event2.kind).toBe('escalation');
    if (event2.kind === 'escalation') {
      expect(event2.result.status).toBe('copied');
      expect(event2.target).toBe('addition-within-20');
    }

    expect(explainCalls).toHaveLength(1);
    const ctx = explainCalls[0];
    expect(ctx.contentLanguage).toBe('uk');
    expect(ctx.explanationLanguage).toBe('en');
    expect(ctx.skillNode).toBe('addition-within-20');
    expect(ctx.failedStep.skillNode).toBe('addition-within-20');
    expect(ctx.priorApproach).toBeDefined();
  });

  it('a correct outcome clears that node\'s diagnostic debt', async () => {
    // Master both roots so failing fraction-simplification sets debt on
    // fruit-equations — a practicable (generator-backed) target.
    await markMastered('addition-within-20');
    await markMastered('unknown-as-missing-addend');
    const controller = new SessionController({ graph: GRAPH_FIXTURE });

    const failStep = makeStep({
      skillNode: 'fraction-simplification',
      expected: '5',
      normalizationPolicy: SCALAR_INTEGER_POLICY,
    });
    await controller.submit({
      task: makeTask([failStep]),
      outputs: [{ rawInput: '9' }],
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'uk',
    });
    expect(controller.getDiagnosticDebt()).toBe('fruit-equations');

    const correctStep = makeStep({
      skillNode: 'fruit-equations',
      expected: '3',
    });
    const correctEvent = await controller.submit({
      task: makeTask([correctStep]),
      outputs: [{ rawInput: '3' }],
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'uk',
    });

    expect(correctEvent.kind).toBe('correct');
    expect(controller.getDiagnosticDebt()).toBeNull();
  });

  it('no SessionViewEvent kind or field is ever a shame-vocabulary surface', async () => {
    const controller = new SessionController({ graph: GRAPH_FIXTURE });
    const step = makeStep({ skillNode: 'fruit-equations', expected: '5' });
    const event = await controller.submit({
      task: makeTask([step]),
      outputs: [{ rawInput: '5' }],
      localeProfile: UK_PROFILE,
      elapsedMs: 1000,
      contentLanguage: 'uk',
      explanationLanguage: 'uk',
    });
    const FORBIDDEN = ['wrong', 'red', 'buzzer', 'shake', 'locked', 'padlock', 'penalty'];
    const serialized = JSON.stringify(event).toLowerCase();
    for (const word of FORBIDDEN) {
      expect(serialized).not.toContain(word);
    }
  });
});
