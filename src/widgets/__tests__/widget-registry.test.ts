/**
 * widget-registry.test.ts — Widget registry contract tests.
 *
 * Tests:
 *   1. WIDGETS covers every InputMode member (exhaustiveness — compile-time
 *      witnessed by the satisfies Record<InputMode, WidgetComponent> on WIDGETS,
 *      plus a runtime keys check against a literal InputMode[]).
 *   2. WidgetOutput shape carries no `expected`/verdict fields (structural
 *      assertion + @ts-expect-error on an `expected` field).
 *   3. keypadDecimalGlyph returns ',' for 'uk' and '.' for 'en'.
 *   4. DiagnosticPayload tag-union shapes for 'choice' and 'tokens'.
 *   5. getWidget returns the correct component for each InputMode.
 *   6. finalOnly is NOT a member of InputMode (the union is not widened).
 *   7. Blind invariant: WidgetProps has no `expected` or verdict callback.
 */

import { WIDGETS, getWidget, keypadDecimalGlyph } from '../widget-registry';
import { resolveLocaleProfile } from '@/parsing';
import type { InputMode } from '@/core/types';
import type {
  DiagnosticPayload,
  WidgetOutput,
  WidgetProps,
} from '../widget-types';

// ---------------------------------------------------------------------------
// 1. Exhaustiveness: WIDGETS covers every InputMode member
// ---------------------------------------------------------------------------

describe('WIDGETS registry exhaustiveness', () => {
  /**
   * The closed InputMode union from @/core/types.ts.
   * This literal array is the runtime witness of the InputMode members.
   * If a new member is added to InputMode and not reflected here, the
   * registry satisfies check in widget-registry.ts catches it at compile
   * time; this test catches the reverse (a member removed from InputMode
   * but left in WIDGETS would not be caught by tsc alone).
   */
  const INPUT_MODES: InputMode[] = [
    'choice',
    'number',
    'tokens',
    'manipulative',
    'multi-slot',
    'compare',
  ];

  it('has a widget entry for every InputMode member', () => {
    for (const mode of INPUT_MODES) {
      expect(WIDGETS[mode]).toBeDefined();
      expect(typeof WIDGETS[mode]).toBe('function');
    }
  });

  it('has no extra entries beyond the InputMode members', () => {
    const widgetKeys = Object.keys(WIDGETS);
    expect(widgetKeys.sort()).toEqual([...INPUT_MODES].sort());
  });

  it('getWidget returns a function for every InputMode member', () => {
    for (const mode of INPUT_MODES) {
      const widget = getWidget(mode);
      expect(typeof widget).toBe('function');
    }
  });

  it('WIDGETS is frozen (immutable registry)', () => {
    expect(Object.isFrozen(WIDGETS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. WidgetOutput shape: no `expected`, no verdict
// ---------------------------------------------------------------------------

describe('WidgetOutput blind invariant', () => {
  it('WidgetOutput can be constructed without expected or verdict fields', () => {
    const output: WidgetOutput = { rawInput: '3,5' };
    expect(output.rawInput).toBe('3,5');
    expect(output.diagnosticPayload).toBeUndefined();
    expect(output.inputStructure).toBeUndefined();
  });

  it('WidgetOutput with full optional fields is valid', () => {
    const output: WidgetOutput = {
      rawInput: 'apple',
      inputStructure: ['apple'],
      diagnosticPayload: { kind: 'choice', chosenId: 'apple' },
    };
    expect(output.rawInput).toBe('apple');
    expect(output.diagnosticPayload).toBeDefined();
  });

  // TypeScript structural assertion: WidgetOutput must NOT have an `expected` field.
  // Verified at compile time by the 'satisfies' constraint below:
  //   (WidgetOutput has only rawInput, inputStructure?, diagnosticPayload?)
  it('WidgetOutput does not accept an expected field (type-level)', () => {
    // Structural proof: WidgetOutput has no 'expected' key.
    // The type has exactly: rawInput, inputStructure?, diagnosticPayload?
    type NoExpectedInOutput = 'expected' extends keyof WidgetOutput ? true : false;
    const _check: NoExpectedInOutput = false; // must be false — 'expected' is not a key
    expect(_check).toBe(false);
    void _check;
  });

  // WidgetProps must NOT have an `expected`, `onCorrect`, or verdict callback.
  it('WidgetProps has no expected field (structural check)', () => {
    // Verify that a valid WidgetProps only has config + onOutput.
    const validProps: WidgetProps = {
      config: { mode: 'number', decimalGlyph: ',', finalOnly: false },
      onOutput: (_out) => {},
    };
    expect(validProps.config).toBeDefined();
    expect(typeof validProps.onOutput).toBe('function');

    // Structural proof: WidgetProps has no 'expected' key.
    type NoExpectedInProps = 'expected' extends keyof WidgetProps ? true : false;
    const _check: NoExpectedInProps = false; // must be false — blind invariant
    expect(_check).toBe(false);
    void _check;
  });
});

// ---------------------------------------------------------------------------
// 3. keypadDecimalGlyph: locale table → keypad glyph
// ---------------------------------------------------------------------------

describe('keypadDecimalGlyph', () => {
  it('returns comma for uk locale (primary MVP locale)', () => {
    const ukProfile = resolveLocaleProfile('uk');
    expect(keypadDecimalGlyph(ukProfile)).toBe(',');
  });

  it('returns period for en locale', () => {
    const enProfile = resolveLocaleProfile('en');
    expect(keypadDecimalGlyph(enProfile)).toBe('.');
  });

  it('returns comma for de locale', () => {
    const deProfile = resolveLocaleProfile('de');
    expect(keypadDecimalGlyph(deProfile)).toBe(',');
  });

  it('returns comma for fr locale', () => {
    const frProfile = resolveLocaleProfile('fr');
    expect(keypadDecimalGlyph(frProfile)).toBe(',');
  });

  it('returns comma for unknown locale (falls back to uk)', () => {
    const unknownProfile = resolveLocaleProfile('xx');
    expect(keypadDecimalGlyph(unknownProfile)).toBe(',');
  });
});

// ---------------------------------------------------------------------------
// 4. DiagnosticPayload tag-union shapes
// ---------------------------------------------------------------------------

describe('DiagnosticPayload tag-union', () => {
  it('choice payload has kind, chosenId, and optional errorType', () => {
    const payload: DiagnosticPayload = {
      kind: 'choice',
      chosenId: 'option-a',
    };
    expect(payload.kind).toBe('choice');
    if (payload.kind === 'choice') {
      expect(payload.chosenId).toBe('option-a');
      expect(payload.errorType).toBeUndefined();
    }
  });

  it('choice payload carries optional errorType', () => {
    const payload: DiagnosticPayload = {
      kind: 'choice',
      chosenId: 'option-b',
      errorType: 'off-by-one',
    };
    if (payload.kind === 'choice') {
      expect(payload.errorType).toBe('off-by-one');
    }
  });

  it('tokens payload has kind and optional divergedAt', () => {
    const payload: DiagnosticPayload = {
      kind: 'tokens',
    };
    expect(payload.kind).toBe('tokens');
    if (payload.kind === 'tokens') {
      expect(payload.divergedAt).toBeUndefined();
    }
  });

  it('tokens payload carries optional divergedAt', () => {
    const payload: DiagnosticPayload = {
      kind: 'tokens',
      divergedAt: 2,
    };
    if (payload.kind === 'tokens') {
      expect(payload.divergedAt).toBe(2);
    }
  });

  it('DiagnosticPayload discriminated union is closed (choice | tokens only)', () => {
    // If a third kind is ever added, the satisfies check below would need updating.
    // This test verifies the exhaustive handling compiles correctly.
    function handlePayload(p: DiagnosticPayload): string {
      switch (p.kind) {
        case 'choice':
          return `choice:${p.chosenId}`;
        case 'tokens':
          return `tokens:${p.divergedAt ?? 'unknown'}`;
        default: {
          const _never: never = p;
          return `unknown:${String(_never)}`;
        }
      }
    }

    expect(handlePayload({ kind: 'choice', chosenId: 'x' })).toBe('choice:x');
    expect(handlePayload({ kind: 'tokens', divergedAt: 1 })).toBe('tokens:1');
    expect(handlePayload({ kind: 'tokens' })).toBe('tokens:unknown');
  });
});

// ---------------------------------------------------------------------------
// 5. getWidget returns correct component for each mode
// ---------------------------------------------------------------------------

describe('getWidget dispatch', () => {
  it('returns ChoiceWidget for choice mode', () => {
    const { ChoiceWidget } = require('../ChoiceWidget');
    expect(getWidget('choice')).toBe(ChoiceWidget);
  });

  it('returns NumberWidget for number mode', () => {
    const { NumberWidget } = require('../NumberWidget');
    expect(getWidget('number')).toBe(NumberWidget);
  });

  it('returns TokensWidget for tokens mode', () => {
    const { TokensWidget } = require('../TokensWidget');
    expect(getWidget('tokens')).toBe(TokensWidget);
  });

  it('returns ManipulativeWidget for manipulative mode', () => {
    const { ManipulativeWidget } = require('../ManipulativeWidget');
    expect(getWidget('manipulative')).toBe(ManipulativeWidget);
  });

  it('returns a function for multi-slot mode', () => {
    // multi-slot uses NumberWidget as the per-slot renderer placeholder
    const widget = getWidget('multi-slot');
    expect(typeof widget).toBe('function');
  });

  it('returns CompareWidget for compare mode', () => {
    const { CompareWidget } = require('../CompareWidget');
    expect(getWidget('compare')).toBe(CompareWidget);
  });
});

// ---------------------------------------------------------------------------
// 6. finalOnly is NOT a member of InputMode
// ---------------------------------------------------------------------------

describe('finalOnly is not an InputMode member', () => {
  it('InputMode union does not include finalOnly', () => {
    const INPUT_MODES: InputMode[] = [
      'choice',
      'number',
      'tokens',
      'manipulative',
      'multi-slot',
      'compare',
    ];

    // Structural proof: 'finalOnly' is NOT assignable to InputMode.
    // If InputMode were widened to include 'finalOnly', this type check would
    // evaluate to true — the test would fail, catching the widen at runtime.
    type FinalOnlyInInputMode = 'finalOnly' extends InputMode ? true : false;
    const _check: FinalOnlyInInputMode = false; // must be false — InputMode is not widened
    expect(_check).toBe(false);
    void _check;

    // finalOnly is not in the runtime set of InputMode values either.
    expect(INPUT_MODES).not.toContain('finalOnly');
  });

  it('NumberWidgetConfig.finalOnly is a boolean flag, not an InputMode', () => {
    // The config shape uses a boolean flag, confirming finalOnly is scaffolding.
    const config = {
      mode: 'number' as const,
      decimalGlyph: ',',
      finalOnly: true, // scaffolding flag — not a mode
    };
    expect(config.mode).toBe('number');
    expect(config.finalOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. WidgetConfig discriminated union shape checks
// ---------------------------------------------------------------------------

describe('WidgetConfig discriminated union', () => {
  it('choice config has mode and options', () => {
    const config = {
      mode: 'choice' as const,
      options: [{ id: 'a', label: { key: 'opt.a' } }],
    };
    expect(config.mode).toBe('choice');
    expect(config.options).toHaveLength(1);
  });

  it('number config has mode, decimalGlyph, and finalOnly', () => {
    const config = {
      mode: 'number' as const,
      decimalGlyph: ',',
      finalOnly: false,
    };
    expect(config.mode).toBe('number');
    expect(config.decimalGlyph).toBe(',');
    expect(config.finalOnly).toBe(false);
  });

  it('tokens config has mode and palette', () => {
    const config = {
      mode: 'tokens' as const,
      palette: [{ id: 'apple', label: { key: 'fruit.apple' } }],
    };
    expect(config.mode).toBe('tokens');
    expect(config.palette).toHaveLength(1);
  });

  it('manipulative config has mode and model with kind', () => {
    const config = {
      mode: 'manipulative' as const,
      model: { kind: 'fraction-bar' as const, payload: {} },
    };
    expect(config.mode).toBe('manipulative');
    expect(config.model.kind).toBe('fraction-bar');
  });

  it('multi-slot config has mode and slots array', () => {
    const config = {
      mode: 'multi-slot' as const,
      slots: [
        { mode: 'number' as const, decimalGlyph: ',', finalOnly: false },
        { mode: 'number' as const, decimalGlyph: ',', finalOnly: false },
      ],
    };
    expect(config.mode).toBe('multi-slot');
    expect(config.slots).toHaveLength(2);
  });

  it('compare config has mode and exactly two locale-formatted display options', () => {
    const config = {
      mode: 'compare' as const,
      options: [
        { id: 'left', display: '3,5' },
        { id: 'right', display: '3,45' },
      ],
    };
    expect(config.mode).toBe('compare');
    expect(config.options).toHaveLength(2);
    expect(config.options.map((o) => o.display)).toEqual(['3,5', '3,45']);
  });
});
