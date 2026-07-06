/**
 * PersonaScreen.tsx — onboarding screen 3: persona selection (stage 07,
 * Phase 3).
 *
 * OWNS NOTHING — DELEGATES TO THE THEME SEAM:
 *   Every option calls `useTheme().setPersona(p)` directly (the SAME setter
 *   the in-app settings surface would use) — this screen adds no new
 *   persona-mutation path. `setPersona` itself only persists
 *   `settings.persona` and re-derives tokens/register; it never touches
 *   difficulty/progress/entry-point state (see `ThemeProvider.tsx`).
 *
 * SKIP → explicit `'adult-16+'` (NOT the raw `'default'` alias), so
 * downstream reads are unambiguous per the locked interview-brief decision.
 * Dark/light stays fully orthogonal — never chosen on this screen.
 */

import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme, type Persona } from '@/theme';
import { useT } from '@/i18n';

// ---------------------------------------------------------------------------
// PersonaScreenProps
// ---------------------------------------------------------------------------

export interface PersonaScreenProps {
  /** Called once a persona is set (explicit choice or skip). */
  readonly onNext: () => void;
}

// ---------------------------------------------------------------------------
// Picker options — ordinary chrome, resolved via common.* i18n keys
// ---------------------------------------------------------------------------

const PERSONA_OPTIONS: readonly { readonly persona: Persona; readonly labelKey: string }[] = [
  { persona: 'adult-16+', labelKey: 'common.personaAdult' },
  { persona: 'kid', labelKey: 'common.personaKid' },
  { persona: 'enthusiast', labelKey: 'common.personaEnthusiast' },
];

/** The clean skip default — the MVP primary persona (interview-brief §A.3). */
const DEFAULT_PERSONA: Persona = 'adult-16+';

// ---------------------------------------------------------------------------
// PersonaScreen
// ---------------------------------------------------------------------------

export function PersonaScreen({ onNext }: PersonaScreenProps): React.JSX.Element {
  const { tokens, setPersona } = useTheme();
  const t = useT();

  const choosePersona = useCallback(
    (persona: Persona): void => {
      setPersona(persona);
      onNext();
    },
    [setPersona, onNext]
  );

  const handleSkip = useCallback((): void => {
    choosePersona(DEFAULT_PERSONA);
  }, [choosePersona]);

  return (
    <View
      style={[styles.container, { backgroundColor: tokens.color.background }]}
      testID="onboarding-persona-screen"
    >
      <Text style={[styles.title, { color: tokens.color.textPrimary }]}>
        {t({ key: 'common.personaLabel' })}
      </Text>

      <View style={styles.options}>
        {PERSONA_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.persona}
            style={[styles.optionButton, { borderColor: tokens.color.border }]}
            onPress={() => choosePersona(option.persona)}
            accessibilityRole="button"
            testID={`onboarding-persona-${option.persona}`}
          >
            <Text style={{ color: tokens.color.textPrimary }}>{t({ key: option.labelKey })}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        onPress={handleSkip}
        accessibilityRole="button"
        testID="onboarding-persona-skip"
      >
        <Text style={{ color: tokens.color.textSecondary }}>{t({ key: 'common.skip' })}</Text>
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
    justifyContent: 'center',
    padding: 24,
    gap: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  options: {
    gap: 12,
  },
  optionButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
});
