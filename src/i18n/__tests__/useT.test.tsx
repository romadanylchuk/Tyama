/**
 * useT.test.tsx — useT() hook regression test (Stage 06, Phase 4 fix).
 *
 * WHY THIS TEST EXISTS:
 *   Phases 1–3 never rendered `useT()` inside an actual component tree (all
 *   prior coverage exercises `resolveRef`/`i18n.t` directly with an injected
 *   `t`). Without an explicit `{ i18n }` binding, react-i18next's
 *   `useTranslation()` cannot discover our manually-created instance (no
 *   `<I18nextProvider>`, no `i18n.use(initReactI18next)` by design — see
 *   `useT.ts` file header) and silently falls back to an "instance not
 *   ready" `t` that just echoes the raw key back. This test proves `useT()`
 *   actually resolves a real catalog string when rendered, guarding against
 *   a regression back to that silent pass-through.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useT } from '../useT';

function Probe(): React.JSX.Element {
  const t = useT();
  return <Text testID="probe">{t({ key: 'common.appName' })}</Text>;
}

describe('useT (rendered in a real component)', () => {
  it('resolves a bare, ordinary catalog key to its real display string, not the raw key', () => {
    const { getByTestId } = render(<Probe />);
    const text = getByTestId('probe').props.children;

    expect(text).not.toBe('common.appName');
    expect(text).toBe('Тяма');
  });

  it('resolves a no-shame-critical key under the default (neutral) register', () => {
    function RegisterProbe(): React.JSX.Element {
      const t = useT();
      return <Text testID="register-probe">{t({ key: 'ring.mastered' })}</Text>;
    }

    const { getByTestId } = render(<RegisterProbe />);
    const text = getByTestId('register-probe').props.children;

    expect(text).not.toBe('ring.mastered');
    // Default register (before any <ThemeProvider> mounts) is 'neutral'.
    expect(text).toBe('Освоєно');
  });
});
