/**
 * ManipulativeWidget.test.tsx — the CPA-concrete widget must emit the learner's
 * typed integer as rawInput (real answer entry), NOT a serialized model blob.
 *
 * Regression for the concrete-level dead-end: previously the widget was a stub
 * whose "confirm" submitted JSON.stringify(payload), which could never equal the
 * canonical numeric answer, so concrete-band tasks were unanswerable.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { ManipulativeWidget } from '../ManipulativeWidget';
import type { ManipulativeWidgetConfig } from '../widget-types';

function numberBondConfig(): ManipulativeWidgetConfig {
  return { mode: 'manipulative', model: { kind: 'number-bond', payload: {} } };
}

describe('ManipulativeWidget', () => {
  it('emits the typed integer as rawInput on confirm', () => {
    const config = numberBondConfig();
    const onOutput = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <ManipulativeWidget config={config} onOutput={onOutput} />
    );

    fireEvent.press(getByLabelText('1'));
    fireEvent.press(getByLabelText('2'));
    fireEvent.press(getByTestId('confirm-button'));

    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ rawInput: '12', inputStructure: config.model })
    );
  });

  it('supports backspace and negative entry', () => {
    const onOutput = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <ManipulativeWidget
        config={{ mode: 'manipulative', model: { kind: 'fraction-bar', payload: {} } }}
        onOutput={onOutput}
      />
    );

    fireEvent.press(getByLabelText('-'));
    fireEvent.press(getByLabelText('5'));
    fireEvent.press(getByTestId('backspace-key'));
    fireEvent.press(getByLabelText('3'));
    fireEvent.press(getByTestId('confirm-button'));

    expect(onOutput).toHaveBeenCalledWith(expect.objectContaining({ rawInput: '-3' }));
  });

  it('resets its input after confirm so the next step starts empty', () => {
    const onOutput = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <ManipulativeWidget config={numberBondConfig()} onOutput={onOutput} />
    );

    fireEvent.press(getByLabelText('7'));
    fireEvent.press(getByTestId('confirm-button'));
    // Second entry must not carry over the first.
    fireEvent.press(getByLabelText('4'));
    fireEvent.press(getByTestId('confirm-button'));

    expect(onOutput).toHaveBeenNthCalledWith(1, expect.objectContaining({ rawInput: '7' }));
    expect(onOutput).toHaveBeenNthCalledWith(2, expect.objectContaining({ rawInput: '4' }));
  });
});
