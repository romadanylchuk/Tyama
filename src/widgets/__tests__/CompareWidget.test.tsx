/**
 * CompareWidget.test.tsx — the blind two-value comparison widget must render
 * exactly the two locale-formatted display strings it was given, and emit
 * the TAPPED option's display string verbatim as `rawInput` on press
 * (never the option `id`, never a verdict, never `expected`).
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { CompareWidget } from '../CompareWidget';
import type { CompareWidgetConfig } from '../widget-types';

function ukConfig(): CompareWidgetConfig {
  return {
    mode: 'compare',
    options: [
      { id: 'left', display: '3,5' },
      { id: 'right', display: '3,45' },
    ],
  };
}

describe('CompareWidget', () => {
  it('renders both displayed options', () => {
    const { getByText } = render(<CompareWidget config={ukConfig()} onOutput={jest.fn()} />);
    expect(getByText('3,5')).toBeTruthy();
    expect(getByText('3,45')).toBeTruthy();
  });

  it('tapping the left option emits its display string verbatim as rawInput', () => {
    const onOutput = jest.fn();
    const { getByTestId } = render(<CompareWidget config={ukConfig()} onOutput={onOutput} />);

    fireEvent.press(getByTestId('compare-option-left'));

    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput).toHaveBeenCalledWith({ rawInput: '3,5' });
  });

  it('tapping the right option emits its display string verbatim as rawInput', () => {
    const onOutput = jest.fn();
    const { getByTestId } = render(<CompareWidget config={ukConfig()} onOutput={onOutput} />);

    fireEvent.press(getByTestId('compare-option-right'));

    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput).toHaveBeenCalledWith({ rawInput: '3,45' });
  });

  it('emits no diagnosticPayload (compare is not a DiagnosticPayload member)', () => {
    const onOutput = jest.fn();
    const { getByTestId } = render(<CompareWidget config={ukConfig()} onOutput={onOutput} />);

    fireEvent.press(getByTestId('compare-option-left'));

    const [output] = onOutput.mock.calls[0];
    expect(output.diagnosticPayload).toBeUndefined();
  });

  it('renders en-locale display strings verbatim (dot separator)', () => {
    const enConfig: CompareWidgetConfig = {
      mode: 'compare',
      options: [
        { id: 'left', display: '3.5' },
        { id: 'right', display: '3.45' },
      ],
    };
    const onOutput = jest.fn();
    const { getByTestId } = render(<CompareWidget config={enConfig} onOutput={onOutput} />);

    fireEvent.press(getByTestId('compare-option-right'));

    expect(onOutput).toHaveBeenCalledWith({ rawInput: '3.45' });
  });
});
