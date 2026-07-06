/**
 * DoneScreen.tsx — onboarding screen 5: calm completion (stage 07, Phase 3).
 *
 * OWNS ONLY THE GATE FLAG:
 *   The single primary affordance sets `settings.onboardingComplete = true`
 *   — exactly the one new setting this stage introduces — then calls
 *   `onComplete` so the caller (`OnboardingFlow` → `AppShell`) re-computes the
 *   entry node and transitions into the main loop. This screen writes no
 *   other state.
 */

import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { settings } from '@/repositories/settings-repository';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';

// ---------------------------------------------------------------------------
// DoneScreenProps
// ---------------------------------------------------------------------------

export interface DoneScreenProps {
  /** Called after `onboardingComplete` is persisted as `true`. */
  readonly onComplete: () => void;
}

// ---------------------------------------------------------------------------
// DoneScreen
// ---------------------------------------------------------------------------

export function DoneScreen({ onComplete }: DoneScreenProps): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();

  const handleEnter = useCallback((): void => {
    void (async (): Promise<void> => {
      await settings.set('onboardingComplete', true);
      onComplete();
    })();
  }, [onComplete]);

  return (
    <View
      style={[styles.container, { backgroundColor: tokens.color.background }]}
      testID="onboarding-done-screen"
    >
      <View style={styles.body}>
        <Text style={[styles.title, { color: tokens.color.textPrimary }]}>
          {t({ key: 'onboarding.doneTitle' })}
        </Text>
        <Text style={[styles.description, { color: tokens.color.textSecondary }]}>
          {t({ key: 'common.doneBody' })}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: tokens.color.accent }]}
        onPress={handleEnter}
        accessibilityRole="button"
        testID="onboarding-done-enter"
      >
        <Text style={styles.primaryButtonLabel}>{t({ key: 'common.continue' })}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
