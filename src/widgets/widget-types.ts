/**
 * widget-types.ts — Blind widget contracts for the answer pipeline.
 *
 * BLIND INVARIANT (enforced by structure, not runtime guards):
 *   Widgets NEVER receive `expected`. Widgets NEVER emit a verdict.
 *   A widget only emits what the learner entered: WidgetOutput.
 *   The pipeline (parseLocaleNumber → canonicalize → checkAnswer) does the
 *   comparison. The widget component is completely decoupled from correctness.
 *
 * DiagnosticPayload is defined here (not in @/checking) because the
 * dependency edge must be ONE-DIRECTIONAL: checking imports from widgets,
 * not the other way around. This avoids a circular dependency.
 *
 * ANTI-SHAME:
 *   No field name here carries shaming vocabulary. No 'wrong', 'error',
 *   'failed', 'incorrect', 'penalty', 'deduction' in the type surface.
 *   DiagnosticPayload carries routing signal only — it is never shown as-is
 *   to the learner.
 *
 * LANGUAGE-NEUTRAL:
 *   All human-readable text fields are LocalizedRef — never raw strings.
 *   Stage-06 presentation layer resolves keys against i18n bundles.
 */

import type React from 'react';

import type { InputMode, LocalizedRef } from '@/core/types';

// Re-export InputMode so widget consumers need only one import surface.
export type { InputMode };

// ---------------------------------------------------------------------------
// DiagnosticPayload — tag-discriminated routing signal
// ---------------------------------------------------------------------------

/**
 * DiagnosticPayload — a tag-discriminated closed union carrying the
 * widget-specific routing signal for the checking engine.
 *
 * Present ONLY where it carries meaningful signal:
 *   - 'choice': identifies which option was tapped and any pre-annotated
 *     error-type hint the content author attached to the distractor.
 *   - 'tokens': identifies where the assembled sequence diverged from the
 *     expected token order (for token-assembly tasks).
 *
 * 'number' and 'manipulative' widgets emit NO diagnosticPayload — their
 * routing signal is fully captured by the canonical numeric comparison.
 *
 * The canonical home of this type is src/widgets/widget-types.ts.
 * @/checking imports it from here to preserve the one-directional edge.
 */
export type DiagnosticPayload =
  | {
      readonly kind: 'choice';
      /** The option id the learner tapped. */
      readonly chosenId: string;
      /**
       * Optional error-type hint pre-annotated by the content author on
       * this distractor option. Stage-06 may use this for targeted hints.
       * Never shown as a 'wrong answer' label — only as a teaching signal.
       */
      readonly errorType?: string;
    }
  | {
      readonly kind: 'tokens';
      /**
       * The index (0-based) of the first token position where the learner's
       * assembly diverged from the expected sequence, if known.
       * Absent when the divergence cannot be pinpointed.
       */
      readonly divergedAt?: number;
    };

// ---------------------------------------------------------------------------
// WidgetOutput — the blind output shape
// ---------------------------------------------------------------------------

/**
 * WidgetOutput — what a widget emits when the learner submits.
 *
 * BLIND: this object NEVER carries `expected` and NEVER carries a verdict.
 * The widget does not know whether the answer is correct — that is the
 * pipeline's concern (parseLocaleNumber → canonicalize → checkAnswer).
 *
 * rawInput: the learner's raw entry as a string, unnormalized.
 *   For number/multi-slot: the keystrokes string (e.g. '3,5' in uk locale).
 *   For tokens: the assembled string representation (e.g. 'apple banana').
 *   For choice: the chosen option id.
 *   For manipulative: a serialized representation of the model state.
 *
 * inputStructure: optional widget-specific structured view of the input.
 *   For tokens: could be the ordered token-id array.
 *   For manipulative: the visual model's state object.
 *   For number/choice: absent (rawInput is sufficient).
 *
 * diagnosticPayload: optional routing signal — present only for 'choice'
 *   and 'tokens' widgets where it carries actionable information for
 *   stage-04 diagnostic routing.
 */
export interface WidgetOutput {
  /**
   * The raw input string from the learner's entry, unnormalized.
   * The checking engine normalizes via parseLocaleNumber → canonicalize.
   */
  readonly rawInput: string;
  /**
   * Optional structured view of the input — widget-specific.
   * Typed as `unknown` because different widget types produce different shapes.
   */
  readonly inputStructure?: unknown;
  /**
   * Optional routing signal for the checking engine. Present only where
   * the widget can carry meaningful additional diagnostic information.
   * 'number' and 'manipulative' widgets always omit this field.
   */
  readonly diagnosticPayload?: DiagnosticPayload;
}

// ---------------------------------------------------------------------------
// Option / Tile / Model shapes for WidgetConfig variants
// ---------------------------------------------------------------------------

/**
 * A single option in a ChoiceWidget.
 *
 * id: stable identifier for this option (echoed in DiagnosticPayload.chosenId).
 * label: language-neutral display text reference (i18n key).
 * diagnostic: optional content-author-annotated error-type hint for this
 *   distractor. Never shown as a shaming label — only used for targeted hints.
 */
export interface ChoiceOption {
  readonly id: string;
  readonly label: LocalizedRef;
  readonly diagnostic?: {
    /** Content-author error-type hint for this distractor (stage-06 i18n dispatch). */
    readonly errorType: string;
  };
}

/**
 * A single token tile in a TokensWidget palette.
 *
 * id: stable identifier for this token.
 * label: language-neutral display text reference (e.g. fruit icon key).
 */
export interface TokenTile {
  readonly id: string;
  readonly label: LocalizedRef;
}

/**
 * ManipulativeModel — the extensible visual model descriptor.
 *
 * Tagged union (kind discriminant) so the ManipulativeWidget can render
 * the appropriate concrete/pictorial form without a competing pattern.
 *
 * 'fraction-bar': a visual fraction bar (e.g. for fraction simplification).
 * 'number-bond': a number bond diagram (e.g. for number sense).
 *
 * The `payload` field is opaque per-kind — the ManipulativeWidget narrows it.
 * New CPA-pictorial manipulative types add a new kind entry here + a renderer
 * in the ManipulativeWidget (stage-06 polish ships the full interactivity).
 */
export type ManipulativeModel =
  | { readonly kind: 'fraction-bar'; readonly payload: unknown }
  | { readonly kind: 'number-bond'; readonly payload: unknown };

// ---------------------------------------------------------------------------
// WidgetConfig — discriminated union keyed by InputMode
// ---------------------------------------------------------------------------

/**
 * WidgetConfig — discriminated union of per-mode widget configurations.
 *
 * Each variant is keyed by `mode` (matching the InputMode closed union from
 * @/core). The widget registry uses `mode` to select the correct component.
 *
 * All display text fields are LocalizedRef — the presentation layer resolves
 * them against the active i18n bundle (stage-06 concern).
 *
 * IMPORTANT: 'finalOnly' is NOT a mode — it is a boolean flag on the 'number'
 * variant, set from Step.elicitFromMastery by the caller. It controls whether
 * NumberWidget renders in speed-drill (bare-answer) layout. This deliberately
 * does NOT widen the InputMode union (DL-7).
 */
export type WidgetConfig =
  | ChoiceWidgetConfig
  | NumberWidgetConfig
  | TokensWidgetConfig
  | ManipulativeWidgetConfig
  | MultiSlotWidgetConfig;

/** Config for the multiple-choice selection widget. */
export interface ChoiceWidgetConfig {
  readonly mode: 'choice';
  /** The options the learner may tap. Exactly one is correct; others are distractors. */
  readonly options: ChoiceOption[];
}

/** Config for the numeric keypad entry widget. */
export interface NumberWidgetConfig {
  readonly mode: 'number';
  /**
   * The decimal separator glyph shown on the keypad (e.g. ',' for uk, '.' for en).
   * MUST come from keypadDecimalGlyph(resolveLocaleProfile(contentLanguage)) so
   * the key the learner taps == the separator the parser expects.
   * Never hardcoded; always sourced from the locale table.
   */
  readonly decimalGlyph: string;
  /**
   * When true, NumberWidget renders in bare-answer / speed-drill layout:
   * the step scaffolding is hidden and only the final answer field is shown.
   * Driven by Step.elicitFromMastery (stage-04 computes the threshold).
   * This is a scaffolding presentation mode — NOT a new InputMode.
   */
  readonly finalOnly: boolean;
}

/** Config for the token-assembly palette widget. */
export interface TokensWidgetConfig {
  readonly mode: 'tokens';
  /**
   * The available token tiles the learner taps to assemble their answer.
   * Order in the palette is stable; the assembled sequence order matters
   * for the checking engine's divergedAt signal.
   */
  readonly palette: TokenTile[];
}

/** Config for the visual manipulative widget (CPA concrete/pictorial). */
export interface ManipulativeWidgetConfig {
  readonly mode: 'manipulative';
  /**
   * Tagged visual model descriptor.
   * The ManipulativeWidget renders the appropriate component from the kind.
   * Full interactivity is a stage-06 polish concern; this stage ships the
   * blind contract + a functioning stub renderer.
   */
  readonly model: ManipulativeModel;
}

/**
 * Config for the multi-slot widget — N positionally-aligned slots, each
 * independently emitting a WidgetOutput.
 *
 * Multi-slot renders once and produces N WidgetOutputs (as MultiSlotOutput),
 * positionally aligned: slots[i] -> steps[i]. Checked independently in order.
 *
 * Each slot has its own keypad config (e.g. different decimalGlyph for
 * mixed-locale tasks, though MVP uses a single contentLanguage).
 */
export interface MultiSlotWidgetConfig {
  readonly mode: 'multi-slot';
  /**
   * Ordered slot configurations. slots[i] corresponds to steps[i].
   * Each slot is a NumberWidgetConfig (multi-slot is numeric only in MVP).
   */
  readonly slots: readonly NumberWidgetConfig[];
}

/**
 * MultiSlotOutput — the output of a MultiSlotWidget.
 *
 * readonly WidgetOutput[] positionally aligned: outputs[i] is the
 * learner's entry for steps[i]. The checking engine walks these in order.
 */
export type MultiSlotOutput = readonly WidgetOutput[];

// ---------------------------------------------------------------------------
// WidgetProps — the component contract
// ---------------------------------------------------------------------------

/**
 * WidgetProps — the single props contract for all widget components.
 *
 * BLIND: no `expected`, no `onCorrect`, no verdict callback.
 * The widget only calls `onOutput` with what the learner entered.
 * The pipeline does the comparison after receiving the output.
 *
 * config: the discriminated WidgetConfig (mode-specific settings).
 * onOutput: called once per scalar slot when the learner confirms an entry.
 *   For single-slot widgets (choice/number/tokens/manipulative): called
 *   exactly once — one WidgetOutput for the one Step.
 *   For multi-slot: called N times, once per slot, in positional order
 *   (slot i ↔ steps[i]). The MultiSlotWidget does NOT batch the slots into
 *   a single call; the caller accumulates the N calls into MultiSlotOutput.
 *   This keeps the per-slot WidgetOutput contract identical across modes.
 */
export interface WidgetProps {
  readonly config: WidgetConfig;
  readonly onOutput: (out: WidgetOutput) => void;
}

/**
 * WidgetComponent — the type alias for all widget React components.
 */
export type WidgetComponent = React.ComponentType<WidgetProps>;
