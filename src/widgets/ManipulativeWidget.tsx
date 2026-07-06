/**
 * ManipulativeWidget.tsx — CPA-concrete answer widget.
 *
 * BLIND INVARIANT: This component never receives `expected` and never emits
 * a verdict. It emits WidgetOutput { rawInput, inputStructure? } when confirmed.
 *
 * NO DiagnosticPayload: ManipulativeWidget emits no diagnosticPayload.
 * The checking engine uses canonical numeric comparison for the output.
 *
 * CONCRETE REPRESENTATION + REAL ANSWER ENTRY:
 *   This is the CPA-concrete band widget for 'number-bonds' (number-bond model)
 *   and 'fraction-simplification' (fraction-bar model). The fully interactive
 *   manipulative renderer (draggable bars / bond diagrams) is a later-stage
 *   enhancement; until it lands, this widget names the concrete model as a
 *   header and provides a real integer keypad so the learner can actually
 *   answer and progress. Every manipulative answer in the MVP is an integer
 *   (a number-bond part/whole, a reduced numerator/denominator), so the keypad
 *   is integer-only (no decimal glyph).
 *
 *   Swapping in the interactive renderer later is contained to this file and
 *   does not change the WidgetOutput contract (rawInput = the answer string).
 *
 * ANTI-SHAME: No correctness feedback rendered here. That is a task-screen concern.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useT } from '@/i18n/useT';
import type { ManipulativeWidgetConfig, WidgetOutput, WidgetProps } from './widget-types';

// ---------------------------------------------------------------------------
// Integer keypad layout (no decimal — manipulative answers are integers)
// ---------------------------------------------------------------------------

const KEYPAD_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
] as const;

// ---------------------------------------------------------------------------
// ManipulativeWidget
// ---------------------------------------------------------------------------

export function ManipulativeWidget({ config, onOutput }: WidgetProps): React.JSX.Element {
  const manipConfig = config as ManipulativeWidgetConfig;
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
      // rawInput: the typed integer answer — parsed by the pipeline.
      rawInput,
      // inputStructure: forward the concrete model for downstream stage-04/06 use.
      inputStructure: manipConfig.model,
      // No diagnosticPayload — manipulative uses canonical comparison.
    };
    onOutput(out);
    // Reset for the next step (fraction-simplification mounts this per-step).
    setRawInput('');
  }, [rawInput, manipConfig.model, onOutput]);

  return (
    <View style={styles.container}>
      {/* Concrete-representation header — names the manipulative model. The full
          interactive fraction-bar / number-bond renderer is a later-stage
          enhancement; the learner answers with the keypad below in the meantime. */}
      <View style={styles.modelHeader} testID="manipulative-model">
        <Text style={styles.modelKind}>
          {t({ key: `widget.manipulative.${manipConfig.model.kind}` })}
        </Text>
      </View>

      {/* Answer display — light background so the dark answer text is legible. */}
      <View style={styles.displayRow}>
        <Text style={styles.displayText} testID="manipulative-display">
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

      {/* Bottom row: minus, zero, backspace */}
      <View style={styles.keyRow}>
        <TouchableOpacity
          style={styles.key}
          onPress={() => handleKey('-')}
          accessibilityRole="button"
          accessibilityLabel="-"
        >
          <Text style={styles.keyText}>{'-'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.key}
          onPress={() => handleKey('0')}
          accessibilityRole="button"
          accessibilityLabel="0"
        >
          <Text style={styles.keyText}>{'0'}</Text>
        </TouchableOpacity>
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
  modelHeader: {
    width: '100%',
    paddingVertical: 4,
    alignItems: 'center',
  },
  modelKind: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  displayRow: {
    width: '100%',
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
