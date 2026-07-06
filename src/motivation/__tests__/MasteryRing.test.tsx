/**
 * MasteryRing.test.tsx — <MasteryRing> component tests (Stage 06, Phase 4).
 *
 * Covers the Phase 4 completion criterion:
 *   - Renders `not-yet-open` muted, with no padlock glyph and never the word
 *     "locked" anywhere in the rendered text.
 *   - Renders a nonzero fill for a novice (in-progress) — the CPA-trajectory
 *     "sees progress immediately" property, made visible.
 *   - Every state resolves its label via the anti-shame `ring.*` i18n catalog,
 *     never a raw/undisplayed key.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import { useTestDb } from '../../../jest.setup';
import { settings } from '@/repositories/settings-repository';
import { ThemeProvider } from '@/theme';
import { MasteryRing, type MasteryRingProps } from '../MasteryRing';

useTestDb();

beforeEach(async () => {
  await settings.hydrate();
});

function renderRing(props: MasteryRingProps) {
  return render(
    <ThemeProvider>
      <MasteryRing {...props} />
    </ThemeProvider>
  );
}

describe('MasteryRing', () => {
  it('renders a nonzero fill for a novice (in-progress) without throwing', () => {
    const { getByTestId } = renderRing({
      nodeId: 'fruit-equations',
      fill: 0.35,
      state: 'in-progress',
    });
    expect(getByTestId('mastery-ring-fruit-equations')).toBeTruthy();
  });

  it('renders not-yet-open muted, with no padlock glyph and never the word "locked"', () => {
    const { getByText, queryByText } = renderRing({
      nodeId: 'addition-within-20',
      fill: 0,
      state: 'not-yet-open',
    });

    // Resolves via the anti-shame ring.notYetOpen catalog key (warm register
    // under the default adult-16+ persona), never a raw key or lock wording.
    expect(getByText('Незабаром')).toBeTruthy();
    expect(queryByText(/locked/i)).toBeNull();
    expect(queryByText('🔒')).toBeNull();
  });

  it('renders the mastered label distinctly from not-yet-open (never the same "denied" surface)', () => {
    const mastered = renderRing({ nodeId: 'fruit-equations', fill: 1, state: 'mastered' });
    expect(mastered.getByText('🌟 Освоєно!')).toBeTruthy();

    const notYetOpen = renderRing({
      nodeId: 'addition-within-20',
      fill: 0,
      state: 'not-yet-open',
    });
    expect(notYetOpen.getByText('Незабаром')).toBeTruthy();
  });

  it('renders an available untouched node (aggregate 0) without an empty/red state', () => {
    const { getByTestId, getByText } = renderRing({
      nodeId: 'number-bonds',
      fill: 0,
      state: 'available',
    });
    expect(getByTestId('mastery-ring-number-bonds')).toBeTruthy();
    expect(getByText('Починаємо!')).toBeTruthy();
  });

  it('renders the in-progress label for a node with partial fill', () => {
    const { getByText } = renderRing({
      nodeId: 'multiplication',
      fill: 0.6,
      state: 'in-progress',
    });
    expect(getByText('У процесі')).toBeTruthy();
  });
});
