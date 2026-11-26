// @vitest-environment jsdom
/**
 * The Simulation header's running pill reads the same truth as its status icon: a lost
 * device stops the sim but leaves `sim.running` set, so the pill shows off and stays put.
 */
import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { rootReducer } from '../../../../../../tools/mcpm-workbench/src/store/rootReducer';
import { deviceLost } from '../../../../../../tools/mcpm-workbench/src/state/view/viewSlice';
import ControlsPanelContainer from '../../../../../../tools/mcpm-workbench/src/ui/containers/sidebars/ControlsPanelContainer';

describe('ControlsPanelContainer', () => {
  it('turns the running pill off and disables it once the device is lost', () => {
    const store = configureStore({ reducer: rootReducer });
    render(
      <Provider store={store}>
        <ControlsPanelContainer id="controls" collapsed={false} />
      </Provider>,
    );
    const pill = screen.getByRole('checkbox', { name: 'running' }) as HTMLInputElement;
    expect(pill.checked).toBe(store.getState().sim.running);
    expect(pill.disabled).toBe(false);

    act(() => {
      store.dispatch(deviceLost());
    });
    expect(pill.checked).toBe(false);
    expect(pill.disabled).toBe(true);
  });
});
