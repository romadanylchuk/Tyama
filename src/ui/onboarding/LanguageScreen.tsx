/**
 * LanguageScreen.tsx — onboarding screen 2: the single language picker
 * (stage 07, Phase 3).
 *
 * OWNS NOTHING — DELEGATES TO THE i18n SEAM:
 *   One picker binds all THREE independent language fields
 *   (`uiLanguage`/`contentLanguage`/`explanationLanguage`) to the same BCP-47
 *   tag, per the locked `SettingsSchema` design (storage keeps them
 *   independent even though this MVP screen sets them together). The active
 *   UI language is then applied LIVE via `initI18n(tag)` so every subsequent
 *   `useT()` read on this same mount reflects the change immediately.
 *
 * LIVE LANGUAGE CHANGE WITHOUT A CONTEXT PROVIDER:
 *   This app never mounts an `<I18nextProvider>` (see `useT.ts`). `useT()`
 *   read here re-renders when `i18n.changeLanguage` fires (react-i18next's
 *   own subscription), but this screen also bumps a local tick so the
 *   re-render is never dependent on that internal wiring alone.
 *
 * SKIP → 'uk' for all three (the documented clean default). Tapping the
 * Ukrainian option produces the identical effect as skipping — both are
 * legitimate, explicit choices.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { settings } from '@/repositories/settings-repository';
import { useTheme } from '@/theme';
import { useT, initI18n, type LocaleTag } from '@/i18n';

// ---------------------------------------------------------------------------
// LanguageScreenProps
// ---------------------------------------------------------------------------

export interface LanguageScreenProps {
  /** Called once the language fields are set (explicit choice or skip). */
  readonly onNext: () => void;
}

// ---------------------------------------------------------------------------
// Picker options — ordinary chrome, resolved via common.* i18n keys
// ---------------------------------------------------------------------------

const LANGUAGE_OPTIONS: readonly { readonly tag: LocaleTag; readonly labelKey: string }[] = [
  { tag: 'uk', labelKey: 'common.languageUk' },
  { tag: 'en', labelKey: 'common.languageEnglish' },
];

/** The clean skip default — matches the schema's own SETTINGS_DEFAULTS. */
const DEFAULT_LANGUAGE_TAG: LocaleTag = 'uk';

// ---------------------------------------------------------------------------
// LanguageScreen
// ---------------------------------------------------------------------------

export function LanguageScreen({ onNext }: LanguageScreenProps): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();
  // Bumped after every language change so this component re-renders even if
  // react-i18next's own subscription were ever bypassed — see file header.
  const [, setRenderTick] = useState(0);

  const selectLanguage = useCallback(
    (tag: LocaleTag): void => {
      void (async (): Promise<void> => {
        await Promise.all([
          settings.set('uiLanguage', tag),
          settings.set('contentLanguage', tag),
          settings.set('explanationLanguage', tag),
        ]);
        await initI18n(tag);
        setRenderTick((n) => n + 1);
        onNext();
      })();
    },
    [onNext]
  );

  const handleSkip = useCallback((): void => {
    selectLanguage(DEFAULT_LANGUAGE_TAG);
  }, [selectLanguage]);

  return (
    <View
      style={[styles.container, { backgroundColor: tokens.color.background }]}
      testID="onboarding-language-screen"
    >
      <Text style={[styles.title, { color: tokens.color.textPrimary }]}>
        {t({ key: 'common.languageLabel' })}
      </Text>

      <View style={styles.options}>
        {LANGUAGE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.tag}
            style={[styles.optionButton, { borderColor: tokens.color.border }]}
            onPress={() => selectLanguage(option.tag)}
            accessibilityRole="button"
            testID={`onboarding-language-${option.tag}`}
          >
            <Text style={{ color: tokens.color.textPrimary }}>{t({ key: option.labelKey })}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        onPress={handleSkip}
        accessibilityRole="button"
        testID="onboarding-language-skip"
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
