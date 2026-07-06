/**
 * WelcomeScreen.tsx — onboarding screen 1: north-star framing (stage 07,
 * Phase 3).
 *
 * OWNS NOTHING: purely presentational. No math, no settings write — just the
 * "I'll give it a try" framing and a single "Begin" affordance that advances
 * the flow. Copy resolves through the `onboarding.welcome*` no-shame-critical
 * catalog keys (see `src/i18n/criticality.ts`).
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/theme';
import { useT } from '@/i18n';

// ---------------------------------------------------------------------------
// WelcomeScreenProps
// ---------------------------------------------------------------------------

export interface WelcomeScreenProps {
  /** Called when the learner taps the single "Begin" affordance. */
  readonly onNext: () => void;
}

// ---------------------------------------------------------------------------
// WelcomeScreen
// ---------------------------------------------------------------------------

export function WelcomeScreen({ onNext }: WelcomeScreenProps): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();

  return (
    <View
      style={[styles.container, { backgroundColor: tokens.color.background }]}
      testID="onboarding-welcome-screen"
    >
      <View style={styles.body}>
        <Text style={[styles.title, { color: tokens.color.textPrimary }]}>
          {t({ key: 'onboarding.welcomeTitle' })}
        </Text>
        <Text style={[styles.description, { color: tokens.color.textSecondary }]}>
          {t({ key: 'onboarding.welcomeBody' })}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: tokens.color.accent }]}
        onPress={onNext}
        accessibilityRole="button"
        testID="onboarding-welcome-begin"
      >
        <Text style={styles.primaryButtonLabel}>{t({ key: 'common.begin' })}</Text>
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
