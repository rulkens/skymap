// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';

import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { exitTakeover } from '../../../../../src/state/takeover/takeoverActions';
import StudioDock from '../../../src/shell/components/StudioDock/StudioDock';
import { paramEdited } from '../../../src/session/state/studioSlice';
import { selectSelection } from '../../../src/session/state/selectors';
import { openStudioStore } from '../../helpers/openStudioStore';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function mount() {
  const store = openStudioStore({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });
  const dispatch = vi.spyOn(store, 'dispatch');
  render(
    <Provider store={store}>
      <StudioDock clipId="cosmicFlows" />
    </Provider>,
  );
  return { store, dispatch };
}

describe('StudioDock', () => {
  it("the grabber's arrow keys resize the dock within its clamp", () => {
    const { store } = mount();
    const grabber = screen.getByRole('separator', { name: 'Resize studio' });
    const dock = screen.getByRole('region', { name: /Clip studio/ });

    for (let i = 0; i < 20; i++) fireEvent.keyDown(grabber, { key: 'ArrowUp' });
    expect(grabber).toHaveAttribute('aria-valuenow', '65');
    expect(dock.style.height).toBe('65%');

    for (let i = 0; i < 20; i++) fireEvent.keyDown(grabber, { key: 'ArrowDown' });
    expect(grabber).toHaveAttribute('aria-valuenow', '25');
    // The arrows were the grabber's: the dock never took them as row selection.
    expect(selectSelection(store.getState())).toBeNull();
  });

  it('a narrow viewport shows the notice with Close', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { dispatch } = mount();

    expect(screen.getByText('Needs a wider screen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dispatch).toHaveBeenCalledWith(exitTakeover());
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('closing the keys overlay gives focus back to its opener', async () => {
    const user = userEvent.setup();
    mount();
    const dock = screen.getByRole('region', { name: /Clip studio/ });
    const opener = screen.getByRole('button', { name: 'Keyboard shortcuts' });

    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Close keys' }));
    expect(opener).toHaveFocus();

    dock.focus();
    await user.keyboard('?');
    expect(screen.getByRole('button', { name: 'Close keys' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(dock).toHaveFocus();
  });

  it('a focused Undo that turns disabled hands focus to the dock', async () => {
    const user = userEvent.setup();
    const { store } = mount();
    act(() => {
      store.dispatch(
        paramEdited({
          ref: { kind: 'effect', path: [0, 0] },
          param: 'to',
          value: 500,
          label: 'Distance',
          gesture: null,
        }),
      );
    });

    await user.click(screen.getByRole('button', { name: 'Undo Distance' }));

    const dock = screen.getByRole('region', { name: /Clip studio/ });
    await waitFor(() => expect(dock).toHaveFocus());
  });

  it('an empty clip says No steps', () => {
    const store = openStudioStore({ timeline: [] });
    render(
      <Provider store={store}>
        <StudioDock clipId="cosmicFlows" />
      </Provider>,
    );
    expect(screen.getByText('No steps')).toBeInTheDocument();
  });

  it('a sideways swipe anywhere in the dock never reaches the browser as a back gesture', () => {
    mount();
    // At Fit nothing pans, so the timeline itself would let the swipe through.
    const reachesBrowser = (target: Element, init: WheelEventInit) => fireEvent.wheel(target, init);
    for (const target of [screen.getByRole('tree'), screen.getByRole('region', { name: /Clip/ })]) {
      expect(reachesBrowser(target, { deltaX: -40, deltaY: 5 })).toBe(false);
      expect(reachesBrowser(target, { deltaY: -40, shiftKey: true })).toBe(false);
      expect(reachesBrowser(target, { deltaX: 5, deltaY: 40 })).toBe(true);
    }
  });
});
