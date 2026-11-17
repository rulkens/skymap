// @vitest-environment jsdom

/**
 * Both looks share one slider table, so a group wired to the wrong look or a knob to the wrong
 * key compiles; these drive the sliders and read the store back.
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import StellarStreamsTuningSectionContainer from '../../../../../src/layers/stellarStreams/streaks/ui/StellarStreamsTuningSectionContainer';
import { initialState } from '../../../../../src/layers/stellarStreams/state/stellarStreams/initialState';
import { selectStellarStreams } from '../../../../../src/layers/stellarStreams/state/stellarStreams/selectors';
import { createTestStore } from '../../../../support/createTestStore';

function renderSection() {
  const { store } = createTestStore();
  const view = render(
    <Provider store={store}>
      <StellarStreamsTuningSectionContainer />
    </Provider>,
  );
  const slider = (group: string, label: string) =>
    within(view.getByRole('group', { name: group })).getByLabelText(label);
  return { store, slider, view };
}

describe('StellarStreamsTuningSectionContainer', () => {
  it('a slider change dispatches setStellarStreamsLook for its look and knob', () => {
    const { store, slider } = renderSection();
    fireEvent.change(slider('Haze', 'Flow'), { target: { value: '6' } });
    fireEvent.change(slider('Streaks', 'Stretch'), { target: { value: '2.5' } });
    const streams = selectStellarStreams(store.getState());
    expect(streams.haze).toEqual({ ...initialState.haze, flow: 6 });
    expect(streams.streak).toEqual({ ...initialState.streak, stretch: 2.5 });
  });

  it('reset restores the defaults', () => {
    const { store, slider, view } = renderSection();
    fireEvent.change(slider('Streaks', 'Intensity'), { target: { value: '0.2' } });
    fireEvent.click(view.getByRole('button', { name: 'Reset looks' }));
    const streams = selectStellarStreams(store.getState());
    expect(streams.streak).toEqual(initialState.streak);
    expect(streams.haze).toEqual(initialState.haze);
  });
});
