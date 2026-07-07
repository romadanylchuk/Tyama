/**
 * MasteryRing.tsx — Graded ring component (Stage 06, Phase 4).
 *
 * RENDERS THE ONE STAGE-04 AGGREGATE, NOTHING ELSE:
 *   `fill` is passed in verbatim from `deriveRingState` — this component
 *   performs no derivation of its own, only presentation.
 *
 * ANTI-SHAME VOCABULARY:
 *   `not-yet-open` renders MUTED — no padlock glyph, no lock icon, and the
 *   label always comes from the `ring.*` i18n catalog (`ring.notYetOpen`,
 *   never a word meaning "locked"). No color here is drawn from a "danger"
 *   palette — `not-yet-open`/`available` use `accentMuted`/`textSecondary`;
 *   `in-progress`/`mastered` use `progress`/`textPrimary`. All four states are
 *   variations of "calm" or "gained", never "denied".
 *
 * PRESENTATION-SHAPE NOTE (implementation detail, not an architecture
 * decision): this renders as a horizontal fill track (a linear "ring") rather
 * than literal circular SVG geometry. The graded-fill contract (partial /
 * full / muted, theme-token-driven, anti-shame-vocabulary labels) is what
 * Phase 4's tests and completion criterion require; literal circular
 * rendering is a visual-polish concern for the Phase-6 node-map screen to
 * refine without changing this component's props contract.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { NodeId } from '@/core/types';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import type { RingState } from './ring-state';

// ---------------------------------------------------------------------------
// Ring-state → i18n label key (config-as-data — mirrors the catalog's ring.* keys)
// ---------------------------------------------------------------------------

const RING_STATE_LABEL_KEY: Readonly<Record<RingState, string>> = Object.freeze({
  'not-yet-open': 'ring.notYetOpen',
  available: 'ring.available',
  'in-progress': 'ring.inProgress',
  mastered: 'ring.mastered',
});

// ---------------------------------------------------------------------------
// MasteryRingProps
// ---------------------------------------------------------------------------

export interface MasteryRingProps {
  readonly nodeId: NodeId;
  /** Raw aggregate scalar (0..1) — always `deriveRingState(...).fill` verbatim. */
  readonly fill: number;
  readonly state: RingState;
}

// ---------------------------------------------------------------------------
// MasteryRing
// ---------------------------------------------------------------------------

export function MasteryRing({ nodeId, fill, state }: MasteryRingProps): React.JSX.Element {
  const { tokens } = useTheme();
  const t = useT();

  const label = t({ key: RING_STATE_LABEL_KEY[state] });
  // Defensive display clamp only — deriveRingState's `fill` is structurally
  // guaranteed within [0,1], this just protects the width% render.
  const clampedFill = Math.max(0, Math.min(1, fill));
  const isMuted = state === 'not-yet-open';

  return (
    <View style={styles.container} testID={`mastery-ring-${nodeId}`}>
      <View
        style={[
          styles.track,
          { borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
        ]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clampedFill * 100) }}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${clampedFill * 100}%`,
              backgroundColor: isMuted ? tokens.color.accentMuted : tokens.color.progress,
            },
          ]}
        />
      </View>
      <Text
        style={[
          styles.label,
          { color: isMuted ? tokens.color.textSecondary : tokens.color.textPrimary },
        ]}
      >
        {label}
      </Text>
      {/* Numeric progress — the honest companion to the fill bar. Shown for
          every open state (incl. 'available' at 0%) so the learner always has
          a concrete number, not just a 64px sliver. Muted nodes stay label-only. */}
      {!isMuted ? (
        <Text
          style={[styles.percent, { color: tokens.color.textSecondary }]}
          testID={`mastery-ring-percent-${nodeId}`}
        >
          {`${Math.round(clampedFill * 100)}%`}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
  },
  track: {
    width: 64,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
  },
  percent: {
    fontSize: 11,
  },
});
