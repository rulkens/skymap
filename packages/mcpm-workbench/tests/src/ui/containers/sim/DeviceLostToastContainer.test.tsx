// @vitest-environment jsdom
/**
 * The lost-GPU toast appears, with its Reload button, only once the device is lost.
 */
import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it } from 'vitest';
import { rootReducer } from '../../../../../src/store/rootReducer';
import { deviceLost } from '../../../../../src/state/view/viewSlice';
import DeviceLostToastContainer from '../../../../../src/ui/containers/sim/DeviceLostToastContainer';

// jsdom has no Popover API, and counts a popover as hidden, so the queries pass `hidden`.
beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {};
});

describe('DeviceLostToastContainer', () => {
  it('shows nothing while the device is fine, then the alert with Reload once it is lost', () => {
    const store = configureStore({ reducer: rootReducer });
    render(
      <Provider store={store}>
        <DeviceLostToastContainer />
      </Provider>,
    );
    expect(screen.queryByRole('alert', { hidden: true })).toBeNull();

    act(() => {
      store.dispatch(deviceLost());
    });
    expect(screen.getByRole('alert', { hidden: true }).textContent).toContain('GPU device lost');
    expect(screen.getByRole('button', { name: 'Reload', hidden: true })).toBeTruthy();
  });
});
