/**
 * CompareWidget.tsx — Blind two-value "pick the larger" comparison widget.
 *
 * BLIND INVARIANT: This component never receives `expected` and never emits
 * a verdict. It only emits WidgetOutput when the learner taps one of the two
 * displayed options. The pipeline determines correctness after receiving the
 * output (parseLocaleNumber → canonicalize → compare against step.expected).
 *
 * RAW-INPUT CONTRACT (load-bearing — see widget-types.ts CompareOption doc):
 *   rawInput MUST be `option.display` EXACTLY as rendered — the locale-
 *   formatted number string build-widget-config produced (e.g. '3,5' under
 *   'uk'). This mirrors keypad-typed input so the SAME parseLocaleNumber path
 *   handles both a NumberWidget entry and a CompareWidget tap.
 *
 * ANTI-SHAME: No visual distinction between the larger value and the smaller
 * distractor is rendered here. Both options render neutrally; correctness
 * feedback is a stage-06 presentation concern.
 *
 * NO DiagnosticPayload:
 *   CompareWidget emits no diagnosticPayload — DiagnosticPayload is a closed
 *   'choice' | 'tokens' union and does not include 'compare'. The canonical
 *   numeric comparison against step.expected provides all needed routing
 *   signal (mirrors 'number'/'manipulative').
 */

import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { CompareWidgetConfig, WidgetOutput, WidgetProps } from './widget-types';

// ---------------------------------------------------------------------------
// CompareWidget
// ---------------------------------------------------------------------------

/**
 * CompareWidget — renders exactly two tappable number options side by side.
 *
 * On tap: emits WidgetOutput with:
 *   rawInput: option.display (the locale-formatted string exactly as shown).
 *
 * The component only accepts 'compare' mode config. The registry ensures
 * this component is never mounted with a non-compare config.
 */
export function CompareWidget({ config, onOutput }: WidgetProps): React.JSX.Element {
  // Narrow to CompareWidgetConfig — safe because the registry routes by mode.
  const compareConfig = config as CompareWidgetConfig;

  const handleTap = useCallback(
    (display: string) => {
      const out: WidgetOutput = {
        rawInput: display,
        // No diagnosticPayload — 'compare' is not a DiagnosticPayload member.
      };
      onOutput(out);
    },
    [onOutput]
  );

  return (
    <View style={styles.container}>
      {compareConfig.options.map((option) => (
        <TouchableOpacity
          key={option.id}
          style={styles.option}
          onPress={() => handleTap(option.display)}
          accessibilityRole="button"
          accessibilityLabel={option.display}
          testID={`compare-option-${option.id}`}
        >
          <Text style={styles.optionText}>{option.display}</Text>
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
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 20,
    color: '#333',
    fontWeight: '600',
  },
});
