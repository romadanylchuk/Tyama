/**
 * @/widgets barrel — public surface of the widget module.
 *
 * Exports:
 *   Contracts:
 *     DiagnosticPayload  — tag-discriminated routing signal ('choice' | 'tokens')
 *     WidgetOutput       — blind output shape (rawInput, inputStructure?, diagnosticPayload?)
 *     WidgetConfig       — discriminated union of per-mode configs
 *     ChoiceWidgetConfig / NumberWidgetConfig / TokensWidgetConfig /
 *     ManipulativeWidgetConfig / MultiSlotWidgetConfig — individual config shapes
 *     ChoiceOption / TokenTile / ManipulativeModel — sub-shapes
 *     MultiSlotOutput    — ReadonlyArray<WidgetOutput> for multi-slot
 *     WidgetProps        — { config, onOutput } — the blind component contract
 *     WidgetComponent    — React.ComponentType<WidgetProps>
 *
 *   Registry:
 *     WIDGETS            — frozen Record<InputMode, WidgetComponent>
 *     getWidget          — exhaustive selector with never-guard
 *     keypadDecimalGlyph — single locale→keypad-glyph translation site
 *
 *   Components:
 *     ChoiceWidget / NumberWidget / TokensWidget / ManipulativeWidget
 *
 * NOTE: DiagnosticPayload is exported from here and re-exported by @/checking
 * to maintain the one-directional dependency edge (checking imports from
 * widgets, not the reverse).
 */

// --- Contracts ---
export type {
  DiagnosticPayload,
  WidgetOutput,
  WidgetConfig,
  ChoiceWidgetConfig,
  NumberWidgetConfig,
  TokensWidgetConfig,
  ManipulativeWidgetConfig,
  MultiSlotWidgetConfig,
  ChoiceOption,
  TokenTile,
  ManipulativeModel,
  MultiSlotOutput,
  WidgetProps,
  WidgetComponent,
  InputMode,
} from './widget-types';

// --- Registry ---
export { WIDGETS, getWidget, keypadDecimalGlyph } from './widget-registry';

// --- Components ---
export { ChoiceWidget } from './ChoiceWidget';
export { NumberWidget } from './NumberWidget';
export { TokensWidget } from './TokensWidget';
export { ManipulativeWidget } from './ManipulativeWidget';
