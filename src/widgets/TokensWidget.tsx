/**
 * TokensWidget.tsx — Blind token-assembly palette widget.
 *
 * BLIND INVARIANT: This component never receives `expected` and never emits
 * a verdict. It emits WidgetOutput when the learner taps "confirm".
 *
 * The learner taps tokens from the palette to assemble a sequence. The
 * assembled sequence is deterministically parseable by the checking engine.
 *
 * DiagnosticPayload: emitted with 'tokens' kind when the learner confirms.
 * divergedAt is absent in this component — it is populated downstream by
 * the checking engine when it detects a divergence. The widget only reports
 * the assembled sequence; the engine determines where divergence occurred.
 *
 * LANGUAGE-NEUTRAL:
 *   Token labels are LocalizedRef — rendered as their `.key` string here.
 *   Stage-06 i18n resolution replaces this with icons / localized text.
 *
 * ANTI-SHAME: No correctness feedback rendered here. Stage-06 concern.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useT } from '@/i18n/useT';
import type { TokensWidgetConfig, WidgetOutput, WidgetProps } from './widget-types';

// ---------------------------------------------------------------------------
// TokensWidget
// ---------------------------------------------------------------------------

/**
 * TokensWidget — renders a token palette for tap-to-assemble answer entry.
 *
 * The learner taps tokens from the palette to build their answer sequence.
 * Tapped tokens appear in the assembly area in order. A "remove last" button
 * allows correction. Confirm emits WidgetOutput.
 *
 * rawInput: space-joined string of assembled token ids (e.g. 'apple banana').
 * inputStructure: the ordered array of token ids for downstream use.
 * diagnosticPayload: { kind: 'tokens' } — divergedAt is absent here;
 *   the checking engine populates it if step-level divergence is found.
 */
export function TokensWidget({ config, onOutput }: WidgetProps): React.JSX.Element {
  const tokensConfig = config as TokensWidgetConfig;
  const t = useT();
  const [assembled, setAssembled] = useState<string[]>([]);

  const handleTapToken = useCallback((tokenId: string) => {
    setAssembled((prev) => [...prev, tokenId]);
  }, []);

  const handleRemoveLast = useCallback(() => {
    setAssembled((prev) => prev.slice(0, -1));
  }, []);

  const handleConfirm = useCallback(() => {
    const out: WidgetOutput = {
      // rawInput: space-joined token ids — deterministically parseable.
      rawInput: assembled.join(' '),
      // inputStructure: the ordered token-id array for downstream use.
      inputStructure: assembled,
      diagnosticPayload: {
        kind: 'tokens',
        // divergedAt is NOT computed here — the checking engine determines it.
        // The widget only reports what was assembled; the engine compares.
      },
    };
    onOutput(out);
    setAssembled([]);
  }, [assembled, onOutput]);

  return (
    <View style={styles.container}>
      {/* Assembly area: shows the tokens the learner has tapped */}
      <View style={styles.assemblyArea} testID="assembly-area">
        {assembled.length > 0 ? (
          <View style={styles.assembledRow}>
            {assembled.map((tokenId, index) => {
              const tile = tokensConfig.palette.find((t) => t.id === tokenId);
              return (
                <View key={index} style={styles.assembledToken}>
                  <Text style={styles.assembledTokenText}>
                    {tile ? t(tile.label) : tokenId}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.assemblyPlaceholder}>{t({ key: 'widget.tokens.tap_to_assemble' })}</Text>
        )}
      </View>

      {/* Remove-last button */}
      <TouchableOpacity
        style={[styles.controlButton, assembled.length === 0 && styles.controlButtonDisabled]}
        onPress={handleRemoveLast}
        disabled={assembled.length === 0}
        accessibilityRole="button"
        accessibilityLabel={t({ key: 'widget.tokens.remove_last' })}
        testID="remove-last-button"
      >
        <Text style={styles.controlButtonText}>{'⌫'}</Text>
      </TouchableOpacity>

      {/* Palette: all available tokens */}
      <View style={styles.palette} testID="token-palette">
        {tokensConfig.palette.map((tile) => (
          <TouchableOpacity
            key={tile.id}
            style={styles.paletteTile}
            onPress={() => handleTapToken(tile.id)}
            accessibilityRole="button"
            accessibilityLabel={t(tile.label)}
          >
            {/* Render the LocalizedRef via i18n; falls back to the key if no string exists. */}
            <Text style={styles.paletteTileText}>{t(tile.label)}</Text>
          </TouchableOpacity>
        ))}
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
    gap: 12,
  },
  assemblyArea: {
    width: '100%',
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  assembledRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  assembledToken: {
    backgroundColor: '#e8f0fe',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assembledTokenText: {
    fontSize: 15,
    color: '#333',
  },
  assemblyPlaceholder: {
    fontSize: 14,
    color: '#aaa',
  },
  controlButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  controlButtonDisabled: {
    opacity: 0.4,
  },
  controlButtonText: {
    fontSize: 18,
    color: '#555',
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paletteTile: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 56,
    alignItems: 'center',
  },
  paletteTileText: {
    fontSize: 16,
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
