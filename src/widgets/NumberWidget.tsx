/**
 * NumberWidget.tsx — Blind numeric keypad entry widget.
 *
 * BLIND INVARIANT: This component never receives `expected` and never emits
 * a verdict. It emits WidgetOutput { rawInput } containing the raw keystrokes
 * string (unnormalized). The pipeline normalizes via parseLocaleNumber.
 *
 * DECIMAL GLYPH SOURCING:
 *   config.decimalGlyph MUST come from keypadDecimalGlyph(resolveLocaleProfile(...))
 *   in the widget registry. This guarantees the key the learner taps on the
 *   keypad == the separator the parser expects. Never hardcoded.
 *
 * FINALY-ONLY MODE:
 *   When config.finalOnly is true, the widget renders in bare-answer /
 *   speed-drill layout: scaffolding is suppressed and only the final answer
 *   input field is shown. This is NOT a new InputMode — it is a scaffolding
 *   presentation mode driven by Step.elicitFromMastery (set by caller).
 *
 * NO DiagnosticPayload:
 *   NumberWidget emits no diagnosticPayload. The canonical numeric comparison
 *   provides all needed routing signal for number-entry steps.
 *
 * ANTI-SHAME:
 *   No visual error feedback is rendered here. Stage-06 handles format hints.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useT } from '@/i18n/useT';
import type { NumberWidgetConfig, WidgetOutput, WidgetProps } from './widget-types';

// ---------------------------------------------------------------------------
// Keypad layout
// ---------------------------------------------------------------------------

/** Standard numeric keypad rows (decimal glyph is substituted from config). */
const KEYPAD_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
] as const;

/** Bottom row: sign toggle, zero, decimal (dynamic), backspace. */
const BOTTOM_ROW_LEFT = ['-', '0'] as const;

// ---------------------------------------------------------------------------
// NumberWidget
// ---------------------------------------------------------------------------

/**
 * NumberWidget — renders a numeric keypad and accumulates keystrokes.
 *
 * The learner taps digits, the decimal glyph from config, and optionally the
 * minus sign. Backspace removes the last character. Confirm emits WidgetOutput.
 *
 * rawInput: the raw keystrokes string as typed (e.g. '3,5' under uk locale).
 * The pipeline normalizes this with parseLocaleNumber(rawInput, localeProfile).
 *
 * finalOnly mode: renders a simplified layout (no step scaffolding row).
 * The keypad itself is identical — only the surrounding layout changes.
 */
export function NumberWidget({ config, onOutput }: WidgetProps): React.JSX.Element {
  const numberConfig = config as NumberWidgetConfig;
  const t = useT();
  const [rawInput, setRawInput] = useState('');

  const handleKey = useCallback((key: string) => {
    setRawInput((prev) => prev + key);
  }, []);

  const handleBackspace = useCallback(() => {
    setRawInput((prev) => prev.slice(0, -1));
  }, []);

  const handleConfirm = useCallback(() => {
    const out: WidgetOutput = {
      rawInput,
      // No diagnosticPayload for number widget — canonical comparison suffices.
    };
    onOutput(out);
    // Reset after submission so the widget is ready for the next step.
    setRawInput('');
  }, [rawInput, onOutput]);

  return (
    <View style={styles.container}>
      {/*
       * finalOnly layout: hide step scaffolding, show only the answer field.
       * Standard layout: could show step prompt (stage-06 concern).
       * Both use the same keypad — only the surrounding chrome differs.
       */}
      {numberConfig.finalOnly ? (
        <View style={styles.finalOnlyHeader}>
          <Text style={styles.finalOnlyLabel}>{t({ key: 'widget.number.final_only' })}</Text>
        </View>
      ) : null}

      {/* Answer display */}
      <View style={styles.displayRow}>
        <Text style={styles.displayText} testID="number-display">
          {rawInput.length > 0 ? rawInput : ' '}
        </Text>
      </View>

      {/* Digit rows */}
      {KEYPAD_ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.keyRow}>
          {row.map((key) => (
            <TouchableOpacity
              key={key}
              style={styles.key}
              onPress={() => handleKey(key)}
              accessibilityRole="button"
              accessibilityLabel={key}
            >
              <Text style={styles.keyText}>{key}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* Bottom row: minus, zero, decimal, backspace */}
      <View style={styles.keyRow}>
        {BOTTOM_ROW_LEFT.map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.key}
            onPress={() => handleKey(key)}
            accessibilityRole="button"
            accessibilityLabel={key}
          >
            <Text style={styles.keyText}>{key}</Text>
          </TouchableOpacity>
        ))}

        {/* Decimal glyph — sourced from locale table via config.decimalGlyph */}
        <TouchableOpacity
          style={styles.key}
          onPress={() => handleKey(numberConfig.decimalGlyph)}
          accessibilityRole="button"
          accessibilityLabel={numberConfig.decimalGlyph}
          testID="decimal-key"
        >
          <Text style={styles.keyText}>{numberConfig.decimalGlyph}</Text>
        </TouchableOpacity>

        {/* Backspace */}
        <TouchableOpacity
          style={styles.key}
          onPress={handleBackspace}
          accessibilityRole="button"
          accessibilityLabel={t({ key: 'widget.backspace' })}
          testID="backspace-key"
        >
          <Text style={styles.keyText}>{'⌫'}</Text>
        </TouchableOpacity>
      </View>

      {/* Confirm */}
      <TouchableOpacity
        style={styles.confirmButton}
        onPress={handleConfirm}
        accessibilityRole="button"
        accessibilityLabel={t({ key: 'widget.confirm' })}
        testID="confirm-button"
      >
        <Text style={styles.confirmText}>{t({ key: 'widget.confirm' })}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  finalOnlyHeader: {
    width: '100%',
    paddingVertical: 4,
    alignItems: 'center',
  },
  finalOnlyLabel: {
    fontSize: 13,
    color: '#888',
  },
  displayRow: {
    width: '100%',
    // Light background so the dark answer text is legible on the dark app shell.
    // (The keypad keys are already light islands; the display field matches them.)
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  displayText: {
    fontSize: 24,
    color: '#111',
    textAlign: 'right',
  },
  keyRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  key: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
  },
  keyText: {
    fontSize: 20,
    color: '#333',
  },
  confirmButton: {
    width: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
