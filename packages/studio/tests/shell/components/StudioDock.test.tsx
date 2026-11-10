// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { exitTakeover } from '../../../../../src/state/takeover/takeoverActions';
import StudioDock from '../../../src/shell/components/StudioDock/StudioDock';
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

  it('an empty clip says No steps', () => {
    const store = openStudioStore({ timeline: [] });
    render(
      <Provider store={store}>
        <StudioDock clipId="cosmicFlows" />
      </Provider>,
    );
    expect(screen.getByText('No steps')).toBeInTheDocument();
  });
});
