/**
 * ChoiceWidget.tsx — Blind multiple-choice selection widget.
 *
 * BLIND INVARIANT: This component never receives `expected` and never emits
 * a verdict. It only emits WidgetOutput when the learner taps an option.
 * The pipeline determines correctness after receiving the output.
 *
 * ANTI-SHAME: No visual distinction between "correct" and "distractor" options
 * is rendered here. The component renders all options neutrally; correctness
 * feedback is a stage-06 presentation concern.
 *
 * LANGUAGE-NEUTRAL: Option labels are LocalizedRef — rendered as their `.key`
 * string here as a placeholder. Stage-06 i18n resolution replaces this with
 * the actual localized text via the i18n provider.
 *
 * DiagnosticPayload: emitted with every tap — chosenId identifies the option,
 * and errorType (if present on the option's diagnostic annotation) carries the
 * content-author hint for stage-04/06 routing. Never shown as a shaming label.
 */

import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useT } from '@/i18n/useT';
import type { ChoiceWidgetConfig, WidgetOutput, WidgetProps } from './widget-types';

// ---------------------------------------------------------------------------
// ChoiceWidget
// ---------------------------------------------------------------------------

/**
 * ChoiceWidget — renders a vertical list of tappable option buttons.
 *
 * On tap: emits WidgetOutput with:
 *   rawInput: option.id (the stable identifier for the chosen option)
 *   diagnosticPayload: { kind: 'choice', chosenId: option.id, errorType?: }
 *
 * The component only accepts 'choice' mode config. The registry ensures
 * this component is never mounted with a non-choice config.
 */
export function ChoiceWidget({ config, onOutput }: WidgetProps): React.JSX.Element {
  // Narrow to ChoiceWidgetConfig — safe because the registry routes by mode.
  const choiceConfig = config as ChoiceWidgetConfig;
  const t = useT();

  const handleTap = useCallback(
    (optionId: string) => {
      const option = choiceConfig.options.find((o) => o.id === optionId);
      const out: WidgetOutput = {
        rawInput: optionId,
        diagnosticPayload: {
          kind: 'choice',
          chosenId: optionId,
          // Carry the content-author error-type hint if annotated on this option.
          // Never shown as a 'wrong answer' label — only as a routing/teaching signal.
          ...(option?.diagnostic?.errorType !== undefined
            ? { errorType: option.diagnostic.errorType }
            : {}),
        },
      };
      onOutput(out);
    },
    [choiceConfig.options, onOutput]
  );

  return (
    <View style={styles.container}>
      {choiceConfig.options.map((option) => (
        <TouchableOpacity
          key={option.id}
          style={styles.option}
          onPress={() => handleTap(option.id)}
          accessibilityRole="button"
          accessibilityLabel={t(option.label)}
        >
          {/* Render the LocalizedRef via i18n; falls back to the key if no string exists. */}
          <Text style={styles.optionText}>{t(option.label)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 8,
  },
  option: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
});
