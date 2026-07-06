/**
 * ClipboardPromptProvider.test.ts — the MVP ExplanationProvider (Stage 06, Phase 3).
 *
 * `expo-clipboard` is globally mapped (jest.config.js moduleNameMapper) to
 * `__mocks__/expo-clipboard.js`, which exposes test utilities directly
 * (`_reset`, `_getLastCopied`, `_getCopyCallCount`, `_setStringAsyncImpl`)
 * rather than jest.fn() spies. Pulled in here via a plain CJS `require()`
 * (NOT `jest.requireMock()` — since no explicit `jest.mock()` factory is
 * registered for this module, `jest.requireMock()` loads a SEPARATE instance
 * from Jest's auto-mock registry, distinct from the module the moduleNameMapper
 * hands to `ClipboardPromptProvider.ts`'s ordinary `import`, which silently
 * breaks assertions against `_lastCopied`/call counts. A plain `require()`
 * resolves through the same moduleNameMapper-backed cache as the production
 * import, guaranteeing both sides share one module instance).
 *
 * Asserts: renders + copies the deterministic prompt, returns a calm
 * `copy-failed` (never a thrown error) when the copy attempt resolves false
 * or rejects, and falls back to the uk template for an unrecognised
 * explanationLanguage.
 */

import { SCALAR_INTEGER_POLICY } from '@/core/canonical';
import type { FailedStep } from '@/checking';
import type { Step } from '@/core/types';
import type { ExplanationRequestContext } from '../explanation-types';
import { ClipboardPromptProvider } from '../ClipboardPromptProvider';
import { renderPrompt } from '../render-prompt';
import { resolvePromptTemplate } from '../prompt-templates';

const Clipboard = require('expo-clipboard');

const STEP: Step = {
  prompt: { key: 'fruit_eq.step.total' },
  inputMode: 'number',
  expected: '8',
  skillNode: 'fruit-equations',
  elicitFromMastery: 1,
  normalizationPolicy: SCALAR_INTEGER_POLICY,
};

const FAILED_STEP: FailedStep = {
  stepIndex: 0,
  skillNode: 'fruit-equations',
  expected: '8',
  received: '7',
};

function makeContext(
  overrides: Partial<ExplanationRequestContext> = {},
): ExplanationRequestContext {
  return {
    problem: {
      prompt: { key: 'fruit_eq.prompt', vars: { apple: 3, banana: 5 } },
      representation: 'pictorial',
    },
    studentAnswer: '7',
    correctAnswer: '8',
    method: { key: 'method.sum_parts' },
    steps: [STEP],
    failedStep: FAILED_STEP,
    skillNode: 'fruit-equations',
    contentLanguage: 'uk',
    explanationLanguage: 'uk',
    ...overrides,
  };
}

beforeEach(() => {
  Clipboard._reset();
});

describe('ClipboardPromptProvider.explain()', () => {
  it('copies the deterministically-rendered prompt and returns status: copied', async () => {
    const provider = new ClipboardPromptProvider();
    const ctx = makeContext();

    const result = await provider.explain(ctx);

    const expectedPrompt = renderPrompt(ctx, resolvePromptTemplate(ctx.explanationLanguage));
    expect(result).toEqual({ kind: 'clipboard', promptText: expectedPrompt, status: 'copied' });
    expect(Clipboard._getLastCopied()).toBe(expectedPrompt);
    expect(Clipboard._getCopyCallCount()).toBe(1);
  });

  it('returns status: copy-failed (never throws) when setStringAsync resolves false (e.g. web permission denied)', async () => {
    Clipboard._setStringAsyncImpl(() => Promise.resolve(false));
    const provider = new ClipboardPromptProvider();

    const result = await provider.explain(makeContext());

    expect(result.status).toBe('copy-failed');
    expect(result.kind).toBe('clipboard');
    expect(result.promptText.length).toBeGreaterThan(0);
    expect(Clipboard._getCopyCallCount()).toBe(1); // attempted the write; the write itself signalled failure
  });

  it('returns status: copy-failed (never throws) when setStringAsync rejects', async () => {
    Clipboard._setStringAsyncImpl(() => {
      throw new Error('simulated clipboard failure');
    });
    const provider = new ClipboardPromptProvider();

    await expect(provider.explain(makeContext())).resolves.toEqual(
      expect.objectContaining({ kind: 'clipboard', status: 'copy-failed' }),
    );
  });

  it('falls back to the uk template for an unrecognised explanationLanguage — never blocks explain()', async () => {
    const provider = new ClipboardPromptProvider();
    const ctx = makeContext({ explanationLanguage: 'zz' });

    const result = await provider.explain(ctx);

    expect(result.status).toBe('copied');
    const ukPrompt = renderPrompt(ctx, resolvePromptTemplate('uk'));
    expect(result.promptText).toBe(ukPrompt);
  });

});
