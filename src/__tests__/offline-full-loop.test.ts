/**
 * offline-full-loop.test.ts — Stage 07 Phase 6 (interruption point "offline
 * full-loop", feature-plan.md Phase 6 step 4 / interview-brief.md §C).
 *
 * Proves the whole MVP loop —
 *   generate -> answer -> check -> ingest (mastery) -> schedule
 *   (spaced repetition) -> route (diagnostic loop) -> explain-to-clipboard
 * — completes with NO network, and:
 *
 *   (a) runs end-to-end against the REAL (unmocked) generator / checking /
 *       mastery / spaced-repetition / routing / explanation seams — nothing
 *       here is a stub of production logic, only the OS-level clipboard write
 *       is test-doubled (via the existing __mocks__/expo-clipboard.js, the
 *       same mock every other explanation test uses).
 *   (b) survives a simulated kill mid-session: reopened via the Phase-5
 *       useRestartableTestDb() cold-restart harness (jest.setup.ts), the
 *       persisted progress/mastery state is intact, and the loop can
 *       correctly continue from there.
 *   (c) ClipboardPromptProvider degrades calmly (`status: 'copy-failed'`,
 *       NEVER throws) when the OS clipboard write fails — the same
 *       "never crash on an external I/O failure" contract offline-first
 *       depends on (ClipboardPromptProvider.test.ts already proves this in
 *       isolation; this suite proves it survives being reached via the FULL
 *       pipeline, not just a hand-built context).
 *   (d) STRUCTURAL: no runtime file under src/core, src/parsing, or
 *       src/checking references fetch/XMLHttpRequest/WebSocket — offline-first
 *       by construction, not by convention. Mirrors anti-shame-guard.test.ts's
 *       text-scan-over-real-source style; a plain substring check is safe here
 *       (unlike "red", these three tokens have no legitimate false-positive
 *       collision anywhere in this codebase's comments or identifiers).
 */

import * as fs from 'fs';
import * as path from 'path';

import { useTestDb, useRestartableTestDb } from '../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { getProgress, upsertNonMilestoneProgress } from '@/repositories';
import {
  loadGraph,
  selectBand,
  createSeededRng,
  getGenerator,
  ingestAttempt,
  parseMasteryMetrics,
  route,
  createAntiLoopMemory,
  makeMasteryLookup,
} from '@/core';
import { applyScheduledReview } from '@/core/spaced-repetition';
import { checkAnswer } from '@/checking';
import type { FailedStep } from '@/checking';
import { resolveLocaleProfile } from '@/parsing';
import { ClipboardPromptProvider } from '@/explanation';
import type { ExplanationRequestContext } from '@/explanation';
import type { WidgetOutput } from '@/widgets';
import type { DifficultyParams, GeneratedTask, NodeId } from '@/core/types';
import type { MasteryMetrics } from '@/core/mastery/mastery-metrics';

const Clipboard = require('expo-clipboard');

// ---------------------------------------------------------------------------
// Shared fixture: the 'number-bonds' node at the abstract band.
//
// Chosen over 'fruit-equations' because its abstract band emits inputMode
// 'number' with a SINGLE integer step (no locale-specific decimal separator
// ever appears in step.expected — a plain non-negative integer string — so
// this suite can feed rawInput = step.expected directly with no ambiguity).
// ---------------------------------------------------------------------------

const NODE_ID: NodeId = 'number-bonds';
const SEED = 424242;
const UK_PROFILE = resolveLocaleProfile('uk');

function buildAbstractDifficulty(coordinate: number): DifficultyParams {
  const graph = loadGraph();
  const node = graph.nodes.find((n) => n.id === NODE_ID)!;
  const band = selectBand(coordinate, node.difficultyHooks.bands);
  return {
    representationLevel: band.representationLevel,
    elicitFromMastery: coordinate,
    params: band.params,
  };
}

function makeExplanationContext(task: GeneratedTask): ExplanationRequestContext {
  const step = task.steps[0];
  const failedStep: FailedStep = {
    stepIndex: 0,
    skillNode: task.skillNode,
    expected: step.expected,
    received: step.expected,
  };
  return {
    problem: task.problem,
    studentAnswer: step.expected,
    correctAnswer: step.expected,
    method: { key: 'method.number_bonds' },
    steps: task.steps,
    failedStep,
    skillNode: task.skillNode,
    contentLanguage: 'uk',
    explanationLanguage: 'uk',
  };
}

// Suppress the loadGraph() fixture-guard console.warn noise (same pattern as
// src/core/__tests__/end-to-end.test.ts).
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  Clipboard._reset();
});
afterEach(() => {
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// (a) + (c) — full loop, no network, in one uninterrupted process
// ---------------------------------------------------------------------------

describe('offline full-loop — no network, generate through explain-to-clipboard', () => {
  useTestDb();

  beforeEach(async () => {
    await settings.hydrate();
  });

  it('completes generate -> answer -> check -> ingest -> schedule -> route -> explain with no network', async () => {
    const graph = loadGraph();
    const gen = getGenerator(NODE_ID)!;
    const difficulty = buildAbstractDifficulty(0.9); // abstract band -> inputMode 'number'
    const task = gen.generate(difficulty, createSeededRng(SEED));
    expect(task.representation).toBe('abstract');

    // --- answer (correct entry) ---
    const outputs: WidgetOutput[] = task.steps.map((step) => ({ rawInput: step.expected }));

    // --- check ---
    const checkResult = await checkAnswer(task.steps, outputs, UK_PROFILE);
    expect(checkResult.outcome).toBe('correct');

    // --- ingest (mastery) ---
    await ingestAttempt({
      skillNode: task.skillNode,
      representationLevel: task.representation,
      outcome: 'correct',
      elapsedMs: 1000,
    });

    const progressRow = await getProgress(NODE_ID);
    expect(progressRow).not.toBeNull();
    const { mastery }: { mastery: MasteryMetrics } = parseMasteryMetrics(progressRow!.metrics);
    expect(mastery.aggregate).toBeGreaterThan(0);

    // --- schedule (spaced repetition) ---
    // apply-review.ts documents the caller contract: only call this for an
    // already-scheduled node (dueAt already set). Seed it explicitly here,
    // matching what the mastery-gate crossing would do in a real session.
    const now = Date.now();
    await upsertNonMilestoneProgress({ nodeId: NODE_ID, dueAt: now });
    const scheduled = await applyScheduledReview(
      NODE_ID,
      { correct: true, elapsedMs: 1000, targetMs: 6000 },
      now
    );
    expect(scheduled.dueAt).toBeGreaterThan(now);

    // --- route (diagnostic loop; a pure, DB-free read over a pre-built snapshot) ---
    const snapshot = new Map<NodeId, MasteryMetrics>();
    for (const node of graph.nodes) {
      const row = await getProgress(node.id);
      const { mastery: nodeMastery } = parseMasteryMetrics(row?.metrics ?? '{}');
      snapshot.set(node.id, nodeMastery);
    }
    const lookup = makeMasteryLookup(snapshot);
    const decision = route(NODE_ID, graph, lookup, createAntiLoopMemory());
    expect(decision.target).toBeTruthy();

    // --- explain-to-clipboard (reached in production only on escalation;
    //     exercised directly here to prove the seam itself needs no network) ---
    const provider = new ClipboardPromptProvider();
    const explainResult = await provider.explain(makeExplanationContext(task));
    expect(explainResult.status).toBe('copied');
    expect(Clipboard._getLastCopied()).toBe(explainResult.promptText);
    expect(explainResult.promptText.length).toBeGreaterThan(0);
  });

  it('ClipboardPromptProvider degrades calmly (status: copy-failed, never throws) when the OS clipboard write fails, reached via the full pipeline', async () => {
    Clipboard._setStringAsyncImpl(() => {
      throw new Error('simulated OS clipboard failure');
    });

    const gen = getGenerator(NODE_ID)!;
    const difficulty = buildAbstractDifficulty(0.9);
    const task = gen.generate(difficulty, createSeededRng(SEED));

    const provider = new ClipboardPromptProvider();
    await expect(provider.explain(makeExplanationContext(task))).resolves.toEqual(
      expect.objectContaining({ status: 'copy-failed' })
    );
  });
});

// ---------------------------------------------------------------------------
// (b) — survives a kill mid-session (cold restart via the Phase-5 harness)
// ---------------------------------------------------------------------------

describe('offline full-loop — survives a kill mid-session (cold restart)', () => {
  const { reopen } = useRestartableTestDb();

  beforeEach(async () => {
    // Re-hydrate against the NAMED db this block's useRestartableTestDb() just
    // swapped in as the active singleton.
    await settings.hydrate();
  });

  it('persisted progress/mastery state survives a cold restart, and the loop correctly continues after reopen', async () => {
    const gen = getGenerator(NODE_ID)!;
    const difficulty = buildAbstractDifficulty(0.9);
    const task = gen.generate(difficulty, createSeededRng(SEED));

    const outputs: WidgetOutput[] = task.steps.map((step) => ({ rawInput: step.expected }));
    const checkResult = await checkAnswer(task.steps, outputs, UK_PROFILE);
    expect(checkResult.outcome).toBe('correct');

    await ingestAttempt({
      skillNode: task.skillNode,
      representationLevel: task.representation,
      outcome: 'correct',
      elapsedMs: 1000,
    });

    const preRestart = await getProgress(NODE_ID);
    expect(preRestart).not.toBeNull();
    const { mastery: preMastery } = parseMasteryMetrics(preRestart!.metrics);
    expect(preMastery.aggregate).toBeGreaterThan(0);

    // Simulate the process being killed mid-session, then a cold restart.
    await reopen();
    await settings.hydrate();

    const postRestart = await getProgress(NODE_ID);
    expect(postRestart).not.toBeNull();
    const { mastery: postMastery } = parseMasteryMetrics(postRestart!.metrics);
    expect(postMastery.aggregate).toBe(preMastery.aggregate);

    // The loop continues correctly after restart: another correct attempt
    // raises (never lowers) the aggregate — proves the persisted state is not
    // just present but genuinely USABLE by the seams that read it post-restart.
    await ingestAttempt({
      skillNode: task.skillNode,
      representationLevel: task.representation,
      outcome: 'correct',
      elapsedMs: 1000,
    });
    const afterSecondAttempt = await getProgress(NODE_ID);
    const { mastery: finalMastery } = parseMasteryMetrics(afterSecondAttempt!.metrics);
    expect(finalMastery.aggregate).toBeGreaterThanOrEqual(postMastery.aggregate);
  });
});

// ---------------------------------------------------------------------------
// (d) — structural: no network reference under the deterministic core
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');
const NO_NETWORK_SUBDIRS = ['core', 'parsing', 'checking'] as const;
const NETWORK_TOKENS = ['fetch(', 'XMLHttpRequest', 'WebSocket'] as const;

function collectRuntimeFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.endsWith('.d.ts')
      ) {
        results.push(full);
      }
    }
  }

  walk(rootDir);
  return results;
}

const RUNTIME_FILES = NO_NETWORK_SUBDIRS.flatMap((d) => collectRuntimeFiles(path.join(SRC_ROOT, d)));

describe('structural: no network access under the deterministic core (offline-first by construction)', () => {
  it('is wired to a non-trivial number of shipped source files (guard-of-the-guard: not accidentally scanning zero files)', () => {
    expect(RUNTIME_FILES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(RUNTIME_FILES.map((f) => [path.relative(REPO_ROOT, f), f] as const))(
    '%s contains no fetch/XMLHttpRequest/WebSocket reference',
    (_relPath, filePath) => {
      const text = fs.readFileSync(filePath, 'utf8');
      for (const token of NETWORK_TOKENS) {
        expect(text).not.toContain(token);
      }
    }
  );
});
