// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { useStudioKeys } from '../../../src/shell/hooks/useStudioKeys';
import { rowSelected } from '../../../src/session/state/studioSlice';
import { selectSelection } from '../../../src/session/state/selectors';
import { openStudioStore } from '../../helpers/openStudioStore';

afterEach(cleanup);

function Dock() {
  return <div tabIndex={-1} data-testid="dock" onKeyDown={useStudioKeys(() => {})} />;
}

const document$ = vi.fn();
document.addEventListener('keydown', document$);

function mount() {
  document$.mockClear();
  const store = openStudioStore({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });
  render(
    <Provider store={store}>
      <Dock />
    </Provider>,
  );
  return { store, dock: screen.getByTestId('dock') };
}

describe('useStudioKeys', () => {
  it('ArrowDown selects the next visible row', () => {
    const { store, dock } = mount();
    store.dispatch(rowSelected({ kind: 'start' }));

    fireEvent.keyDown(dock, { key: 'ArrowDown' });

    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0] });
  });

  it('Escape with a selection clears it and does not reach a document listener', () => {
    const { store, dock } = mount();
    store.dispatch(rowSelected({ kind: 'start' }));

    fireEvent.keyDown(dock, { key: 'Escape' });

    expect(selectSelection(store.getState())).toBeNull();
    expect(document$).not.toHaveBeenCalled();
  });

  it('Escape with no selection reaches the document', () => {
    const { dock } = mount();
    fireEvent.keyDown(dock, { key: 'Escape' });
    expect(document$).toHaveBeenCalledTimes(1);
  });

  it('keys typed into a field are left to the field', () => {
    const { store, dock } = mount();
    store.dispatch(rowSelected({ kind: 'start' }));
    const field = document.createElement('input');
    dock.append(field);

    fireEvent.keyDown(field, { key: 'ArrowDown' });

    expect(selectSelection(store.getState())).toEqual({ kind: 'start' });
  });
});
