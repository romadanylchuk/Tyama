/**
 * ManipulativeWidget.tsx — Blind visual manipulative stub widget (CPA concrete/pictorial).
 *
 * BLIND INVARIANT: This component never receives `expected` and never emits
 * a verdict. It emits WidgetOutput { rawInput, inputStructure? } when confirmed.
 *
 * NO DiagnosticPayload: ManipulativeWidget emits no diagnosticPayload.
 * The checking engine uses canonical numeric comparison for the output.
 *
 * FULL INTERACTIVITY IS A STAGE-06 CONCERN:
 *   This stage ships the blind contract and a functioning stub renderer.
 *   The stub renders a placeholder UI showing the model kind + confirming
 *   the blind output contract. Stage-06 polish replaces the stub with the
 *   full CPA-pictorial interactive implementation (drag/drop, fraction bars,
 *   number bond diagrams, etc.) without changing the WidgetOutput contract.
 *
 * ManipulativeModel is a tagged union ('fraction-bar' | 'number-bond' | ...)
 * so new CPA manipulative types add a new case here in stage-06 without
 * changing the registry or contract.
 *
 * ANTI-SHAME: No correctness feedback rendered here. Stage-06 concern.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useT } from '@/i18n/useT';
import type { ManipulativeWidgetConfig, WidgetOutput, WidgetProps } from './widget-types';

// ---------------------------------------------------------------------------
// ManipulativeWidget
// ---------------------------------------------------------------------------

/**
 * ManipulativeWidget — stub renderer for visual manipulative models.
 *
 * Current implementation: renders the model kind name as a placeholder
 * and provides a confirm button. The learner's "interaction" is simulated
 * by the confirm action, which emits WidgetOutput with the serialized
 * model state as rawInput and inputStructure.
 *
 * Stage-06 replaces this stub with the full interactive renderer.
 */
export function ManipulativeWidget({ config, onOutput }: WidgetProps): React.JSX.Element {
  const manipConfig = config as ManipulativeWidgetConfig;
  const t = useT();
  const [interacted, setInteracted] = useState(false);

  const handleInteract = useCallback(() => {
    // Stub interaction: mark as interacted (stage-06 will add real drag/tap logic).
    setInteracted(true);
  }, []);

  const handleConfirm = useCallback(() => {
    // Serialize the model state as rawInput for the pipeline.
    // In the full implementation, this would reflect the learner's
    // actual manipulative state (e.g. fraction bar segments selected).
    const modelState = JSON.stringify(manipConfig.model.payload ?? {});
    const out: WidgetOutput = {
      rawInput: modelState,
      // inputStructure: the full model object for downstream stage-04/06 use.
      inputStructure: manipConfig.model,
      // No diagnosticPayload — manipulative uses canonical comparison.
    };
    onOutput(out);
    setInteracted(false);
  }, [manipConfig.model, onOutput]);

  return (
    <View style={styles.container}>
      {/* Model kind label — stage-06 replaces with the real interactive widget. */}
      <View style={styles.modelStub} testID="manipulative-stub">
        <Text style={styles.stubKind}>{t({ key: `widget.manipulative.${manipConfig.model.kind}` })}</Text>
        <Text style={styles.stubNote}>{'[stub — stage-06 interactive renderer]'}</Text>
        {interacted ? (
          <Text style={styles.stubInteracted}>{t({ key: 'widget.manipulative.interacted' })}</Text>
        ) : null}
      </View>

      {/* Stub interaction button */}
      <TouchableOpacity
        style={styles.interactButton}
        onPress={handleInteract}
        accessibilityRole="button"
        accessibilityLabel={t({ key: 'widget.manipulative.interact' })}
        testID="interact-button"
      >
        <Text style={styles.interactText}>{t({ key: 'widget.manipulative.interact' })}</Text>
      </TouchableOpacity>

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
    gap: 12,
  },
  modelStub: {
    width: '100%',
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  stubKind: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  stubNote: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 4,
  },
  stubInteracted: {
    fontSize: 13,
    color: '#007AFF',
    marginTop: 8,
  },
  interactButton: {
    width: '100%',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  interactText: {
    fontSize: 15,
    color: '#333',
  },
  confirmButton: {
    width: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
