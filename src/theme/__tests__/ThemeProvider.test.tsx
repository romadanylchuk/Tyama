/**
 * ThemeProvider.test.tsx — theme/persona provider seam tests (Stage 06,
 * Phase 2).
 *
 * Covers:
 *   - useTheme() resolves the persona bundle for the default ('adult-16+') persona
 *   - switching persona swaps BOTH tokens and register
 *   - the register seam pushes into i18n (setI18nRegister) so useT()/resolveRef
 *     resolve the '_warm' variant under a warm-register persona
 *   - a persona change touches NO difficulty/progress/mastery/routing write path
 *     (R1 / locked decision #12) — asserted via jest.mock spies showing zero calls
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useTestDb } from '../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import i18n, { getI18nRegister } from '@/i18n/i18n';
import { resolveRef } from '@/i18n/resolve-ref';
import { PERSONA_BUNDLES } from '../tokens';
import { ThemeProvider, useTheme, type ThemeContextValue } from '../ThemeProvider';

// ---------------------------------------------------------------------------
// Structural safety net: a persona change must never touch these write paths.
// ---------------------------------------------------------------------------
jest.mock('@/repositories/progress-repository', () => ({
  getProgress: jest.fn(),
  getDueNodes: jest.fn(),
  upsertNonMilestoneProgress: jest.fn(),
}));
jest.mock('@/core/mastery/ingest-attempt', () => ({
  ingestAttempt: jest.fn(),
}));
jest.mock('@/core/routing/route', () => ({
  route: jest.fn(),
}));

import { getProgress, getDueNodes, upsertNonMilestoneProgress } from '@/repositories/progress-repository';
import { ingestAttempt } from '@/core/mastery/ingest-attempt';
import { route } from '@/core/routing/route';

useTestDb();

// ---------------------------------------------------------------------------
// Probe component — captures the live useTheme() context value for assertions.
// ---------------------------------------------------------------------------

let captured: ThemeContextValue | null = null;

function Probe(): React.JSX.Element {
  // eslint-disable-next-line react-hooks/globals -- test-only capture probe; reassigning the module-level holder is the point.
  captured = useTheme();
  return <Text>{captured.persona}</Text>;
}

beforeEach(async () => {
  captured = null;
  jest.clearAllMocks();
  // Fresh in-memory DB per test (useTestDb) — re-hydrate the settings
  // singleton's cache from it so settings.get('persona') reflects a clean
  // 'default' (schema default) at the start of each test.
  await settings.hydrate();
});

describe('ThemeProvider / useTheme', () => {
  it('resolves the adult-16+ bundle for the default persona and scheme light (test env)', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(captured).not.toBeNull();
    expect(captured!.persona).toBe('adult-16+');
    expect(captured!.register).toBe('warm');
    expect(captured!.tokens).toEqual(PERSONA_BUNDLES['adult-16+'][captured!.scheme]);
  });

  it('pushes the resolved register into the i18n module on mount', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(getI18nRegister()).toBe('warm');
  });

  it('switching persona swaps BOTH tokens and register', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(captured!.persona).toBe('adult-16+');
    expect(captured!.register).toBe('warm');

    act(() => {
      captured!.setPersona('enthusiast');
    });

    expect(captured!.persona).toBe('enthusiast');
    expect(captured!.register).toBe('neutral');
    expect(captured!.tokens).toEqual(PERSONA_BUNDLES.enthusiast[captured!.scheme]);
    // i18n register seam reflects the new persona too.
    expect(getI18nRegister()).toBe('neutral');
  });

  it('persists the persona change via settings.set only', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    act(() => {
      captured!.setPersona('kid');
    });

    // Allow the fire-and-forget settings.set() write to resolve.
    await act(async () => {
      await Promise.resolve();
    });

    expect(settings.get('persona')).toBe('kid');
  });

  it('a persona change touches NO progress/mastery/routing write path', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    act(() => {
      captured!.setPersona('kid');
    });
    act(() => {
      captured!.setPersona('enthusiast');
    });

    expect(getProgress).not.toHaveBeenCalled();
    expect(getDueNodes).not.toHaveBeenCalled();
    expect(upsertNonMilestoneProgress).not.toHaveBeenCalled();
    expect(ingestAttempt).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
  });

  it('useT()/resolveRef resolve the _warm variant under the warm-register (adult-16+) persona', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    const register = getI18nRegister();
    expect(register).toBe('warm');

    const t = (key: string, options?: Record<string, unknown>): string =>
      i18n.t(key, options) as string;

    const warmResolved = resolveRef({ key: 'error.notYet' }, t, register);
    const neutralResolved = resolveRef({ key: 'error.notYet' }, t, 'neutral');

    // The warm and neutral catalog variants are distinct strings (see
    // src/i18n/locales/uk.ts) — proves the live register value actually
    // selects the warm variant, not merely falling through to neutral.
    expect(warmResolved).not.toBe(neutralResolved);
  });

  it('useTheme() throws when called outside a ThemeProvider (developer-error guard)', () => {
    function Bare(): React.JSX.Element {
      useTheme();
      return <Text>never</Text>;
    }
    // Suppress React's expected console.error for the thrown-during-render case.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/useTheme\(\) must be called within a <ThemeProvider>/);
    spy.mockRestore();
  });
});
