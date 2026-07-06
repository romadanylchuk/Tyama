/**
 * widget-registry.ts — Static InputMode-keyed widget registry.
 *
 * PATTERN: Mirrors the GENERATORS registry in src/core/generators/registry.ts.
 *   - WIDGETS is a frozen Readonly<Record<InputMode, WidgetComponent>>.
 *   - getWidget(mode) uses an exhaustive switch + never-guard so TypeScript
 *     catches any future InputMode addition that lacks a widget.
 *   - Population is by explicit static imports — no decorators, no dynamic
 *     registration, no side effects.
 *
 * keypadDecimalGlyph(profile) is defined here as the SINGLE place that
 * maps a LocaleNumericProfile to the keypad decimal key label. This
 * guarantees the key the learner taps == the separator parseLocaleNumber
 * expects. Never derive the glyph any other way.
 *
 * ANTI-SHAME:
 *   Widget keys follow 'available' vocabulary. No 'locked', 'disabled',
 *   'error', 'unavailable' in any identifier.
 *
 * SEAM DISCIPLINE:
 *   This registry is the build-time seam for widget selection. The pipeline
 *   calls getWidget(step.inputMode) to obtain the component; it never
 *   imports widget components directly.
 */

import type { InputMode } from '@/core/types';
import type { LocaleNumericProfile } from '@/parsing';

import type { WidgetComponent } from './widget-types';
import { ChoiceWidget } from './ChoiceWidget';
import { NumberWidget } from './NumberWidget';
import { TokensWidget } from './TokensWidget';
import { ManipulativeWidget } from './ManipulativeWidget';

// ---------------------------------------------------------------------------
// MultiSlotWidget — inline thin wrapper over NumberWidget
// ---------------------------------------------------------------------------

/**
 * MultiSlotWidget is NOT a separate component file — it is a structural
 * concept. The registry maps 'multi-slot' to NumberWidget as a placeholder
 * component (the caller coordinates N slots by mounting N NumberWidgets).
 *
 * The multi-slot component type aligns with WidgetComponent so the registry
 * type is fully satisfied. Stage-06 may introduce a dedicated MultiSlotWidget
 * component if layout coordination requires it.
 *
 * NOTE: For now we use NumberWidget as the per-slot renderer. The calling
 * code mounts one NumberWidget per slot and aggregates outputs positionally.
 */
const MultiSlotWidget: WidgetComponent = NumberWidget;

// ---------------------------------------------------------------------------
// WIDGETS — the frozen static registry
// ---------------------------------------------------------------------------

/**
 * WIDGETS — all installed widget components, keyed by InputMode.
 *
 * Frozen at module load time so no runtime code can mutate it.
 * Population rule: ONE explicit import per component, ONE entry per InputMode.
 *
 * EXHAUSTIVENESS: The type `Readonly<Record<InputMode, WidgetComponent>>`
 * enforces that every InputMode member has a widget entry. Adding a new
 * InputMode in @/core/types.ts will cause a compile error here if the
 * widget entry is missing.
 */
export const WIDGETS: Readonly<Record<InputMode, WidgetComponent>> = Object.freeze({
  choice: ChoiceWidget,
  number: NumberWidget,
  tokens: TokensWidget,
  manipulative: ManipulativeWidget,
  'multi-slot': MultiSlotWidget,
} satisfies Record<InputMode, WidgetComponent>);

// ---------------------------------------------------------------------------
// getWidget — the exhaustive selector
// ---------------------------------------------------------------------------

/**
 * getWidget(mode): WidgetComponent
 *
 * Returns the widget component for the given InputMode.
 *
 * Uses an exhaustive switch with a never-guard default so TypeScript catches
 * any InputMode member that lacks a registered widget at compile time.
 * This mirrors the pattern in the generator registry (getGenerator is
 * never-throw; getWidget is always-defined because every InputMode MUST
 * have a widget — an undefined widget is a build mistake, not an OTA-skew
 * case like a missing generator).
 *
 * @param mode - The InputMode from Step.inputMode.
 * @returns The WidgetComponent registered for this mode.
 */
export function getWidget(mode: InputMode): WidgetComponent {
  switch (mode) {
    case 'choice':
      return WIDGETS.choice;
    case 'number':
      return WIDGETS.number;
    case 'tokens':
      return WIDGETS.tokens;
    case 'manipulative':
      return WIDGETS.manipulative;
    case 'multi-slot':
      return WIDGETS['multi-slot'];
    default: {
      // Exhaustiveness guard: if a new InputMode is added to the closed union
      // in @/core/types.ts and no case is added here, TypeScript reports a
      // compile error (the 'never' assignment below is unreachable on a
      // complete union, so an unhandled case causes 'mode' to be typed as the
      // remaining member, which is not assignable to 'never').
      const _exhaustive: never = mode;
      throw new Error(
        `[widget-registry] No widget registered for InputMode '${String(_exhaustive)}'. ` +
          'This is a build mistake: add a widget for this mode to WIDGETS and getWidget().'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// keypadDecimalGlyph — the single locale→keypad-glyph translation site
// ---------------------------------------------------------------------------

/**
 * keypadDecimalGlyph(profile): string
 *
 * Returns the decimal separator glyph to display on the numeric keypad for
 * the given locale profile.
 *
 * This is the SINGLE place where LocaleNumericProfile.decimalSep is
 * translated into the keypad key label. Using this function guarantees that:
 *   - The key the learner taps == the separator parseLocaleNumber expects.
 *   - There is no other site that independently reads the separator.
 *   - Changing the locale table automatically flows to the keypad.
 *
 * Always source NumberWidgetConfig.decimalGlyph from this function.
 * Never hardcode ',' or '.' in widget config construction.
 *
 * @param profile - The resolved LocaleNumericProfile for contentLanguage.
 * @returns The decimal separator character string for this locale.
 */
export function keypadDecimalGlyph(profile: LocaleNumericProfile): string {
  return profile.decimalSep;
}
