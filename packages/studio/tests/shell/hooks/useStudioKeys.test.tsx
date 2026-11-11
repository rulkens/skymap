// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { exitTakeover } from '../../../../../src/state/takeover/takeoverActions';
import { useStudioKeys } from '../../../src/shell/hooks/useStudioKeys';
import {
  paramEdited,
  played,
  playheadSet,
  rowSelected,
} from '../../../src/session/state/studioSlice';
import {
  selectSelection,
  selectTransport,
  selectUndoLabel,
  selectViewport,
} from '../../../src/session/state/selectors';
import { clipStarted } from '../../../../../src/state/camera/cameraSlice';
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
  const dispatch = vi.spyOn(store, 'dispatch');
  render(
    <Provider store={store}>
      <Dock />
    </Provider>,
  );
  return { store, dispatch, dock: screen.getByTestId('dock') };
}

/** A control inside the dock, focused there. */
function inside(dock: HTMLElement, html: string): HTMLElement {
  dock.insertAdjacentHTML('beforeend', html);
  return dock.lastElementChild as HTMLElement;
}

describe('useStudioKeys', () => {
  it('ArrowDown selects the next visible row', () => {
    const { store, dock } = mount();
    store.dispatch(rowSelected({ kind: 'start' }));

    fireEvent.keyDown(dock, { key: 'ArrowDown' });

    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0] });
  });

  it('= zooms in about the playhead and - zooms back out to Fit', () => {
    const { store, dock } = mount();

    fireEvent.keyDown(dock, { key: '=' });
    expect(selectViewport(store.getState())).toEqual({ startSec: 0, endSec: 4.8 });

    fireEvent.keyDown(dock, { key: '-' });
    expect(selectViewport(store.getState())).toBeNull();
  });

  it('the first Escape clears the selection, the next ends the takeover', () => {
    const { store, dispatch, dock } = mount();
    store.dispatch(rowSelected({ kind: 'start' }));

    fireEvent.keyDown(dock, { key: 'Escape' });
    expect(selectSelection(store.getState())).toBeNull();
    expect(dispatch).not.toHaveBeenCalledWith(exitTakeover());

    fireEvent.keyDown(dock, { key: 'Escape' });
    expect(dispatch).toHaveBeenCalledWith(exitTakeover());
    expect(document$).not.toHaveBeenCalled();
  });

  it('no key reaches the app, and Tab keeps its default so focus moves', () => {
    const { dock } = mount();
    fireEvent.keyDown(dock, { key: 'f' });
    const tabKept = fireEvent.keyDown(dock, { key: 'Tab' });

    expect(tabKept).toBe(true);
    expect(document$).not.toHaveBeenCalled();
  });

  it('keys typed into a field are left to the field', () => {
    const { store, dock } = mount();
    store.dispatch(rowSelected({ kind: 'start' }));
    const field = inside(dock, '<input type="text" />');

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(selectSelection(store.getState())).toEqual({ kind: 'start' });
  });

  it('a select keeps its arrows, but Escape and ⌘Z still reach the studio', () => {
    const { store, dock } = mount();
    store.dispatch(
      paramEdited({
        ref: { kind: 'effect', path: [0, 0] },
        param: 'to',
        value: 500,
        label: 'Distance',
        gesture: null,
      }),
    );
    store.dispatch(rowSelected({ kind: 'start' }));
    const select = inside(dock, '<select><option>a</option></select>');

    fireEvent.keyDown(select, { key: 'ArrowDown' });
    expect(selectSelection(store.getState())).toEqual({ kind: 'start' });

    fireEvent.keyDown(select, { key: 'z', metaKey: true });
    expect(selectUndoLabel(store.getState())).toBeNull();
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(selectSelection(store.getState())).toBeNull();
  });

  it('a key a control already acted on (the slider’s arrows) is left to it', () => {
    const { store, dock } = mount();
    store.dispatch(rowSelected({ kind: 'start' }));
    const slider = inside(dock, '<div role="slider" tabindex="0"></div>');
    slider.addEventListener('keydown', (event) => event.preventDefault());

    fireEvent.keyDown(slider, { key: 'ArrowDown' });

    expect(selectSelection(store.getState())).toEqual({ kind: 'start' });
  });

  it('Space at End plays from 0; Space while playing pauses', () => {
    const { store, dock } = mount();
    // The preview is live: Play waits for it.
    store.dispatch(clipStarted({ data: { timeline: [] }, frame: 'equatorial', atEnd: 'revert' }));
    store.dispatch(playheadSet(8));

    fireEvent.keyDown(dock, { key: ' ' });
    expect(selectTransport(store.getState())).toEqual({ kind: 'running', fromSec: 0, loop: null });

    fireEvent.keyDown(dock, { key: ' ' });
    expect(selectTransport(store.getState())).toEqual({ kind: 'paused', atSec: 0, camera: 'clip' });
  });

  it('End while playing pauses at End', () => {
    const { store, dock } = mount();
    store.dispatch(played({ fromSec: 1, loop: null }));

    fireEvent.keyDown(dock, { key: 'End' });
    expect(selectTransport(store.getState())).toEqual({ kind: 'paused', atSec: 8, camera: 'clip' });
  });

  it("Space on a focused button is the button's", () => {
    const { dispatch, dock } = mount();
    const button = inside(dock, '<button>Undo</button>');
    button.focus();
    fireEvent.keyDown(button, { key: ' ' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('L while playing outside the selected span resumes from its start', () => {
    const { store, dock } = mount();
    store.dispatch(rowSelected({ kind: 'effect', path: [0, 1] }));
    store.dispatch(played({ fromSec: 1, loop: null }));

    fireEvent.keyDown(dock, { key: 'l' });
    const loop = { startSec: 4, endSec: 8 };
    expect(selectTransport(store.getState())).toEqual({ kind: 'running', fromSec: 4, loop });
  });
});
