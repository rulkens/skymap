/**
 * watchKeyboardEventsSaga tests — integration over a real store + saga
 * middleware, with `createKeyboardListener` mocked so no real hotkeys-js/DOM is
 * involved. The mock returns a real redux-saga `eventChannel` whose `emit` is
 * exposed on a hoisted holder, so a test can push synthetic keys and assert the
 * saga routed each through its `KeyboardShortcut.run` to the dispatched
 * action(s). A recorder middleware captures every dispatched action.
 *
 * This test exercises the DRAIN routing (known key → put, null run → nothing,
 * unknown key → skip, multi-action entry → both in order). It does NOT re-test
 * the per-entry `run` bodies (Task 4) — a few entries are used only as vehicles
 * for the drain.
 *
 * ### Timing
 *
 * An `eventChannel` emit is delivered on a macrotask boundary, so one `flush()`
 * lets the saga's `take(channel)` pick it up and `put` the mapped action.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Action } from '@reduxjs/toolkit';

const h = vi.hoisted(() => ({
  emit: undefined as undefined | ((key: string) => void),
}));

vi.mock('../../../src/services/input/createKeyboardListener', async () => {
  const { eventChannel } = await import('redux-saga');
  return {
    createKeyboardListener: () =>
      eventChannel<string>((emit) => {
        h.emit = emit;
        return () => {};
      }),
  };
});

import { rootReducer } from '../../../src/store/rootReducer';
import { watchKeyboardEventsSaga } from '../../../src/state/input/watchKeyboardEventsSaga';
import { setPaletteOpen } from '../../../src/state/ui/uiSlice';
import { clearSelection } from '../../../src/state/selection/selectionSlice';
import { exitTour } from '../../../src/state/tour/tourActions';
import { stopClip } from '../../../src/state/camera/clipActions';

const flush = () => new Promise((r) => setTimeout(r, 0));

function buildHarness() {
  const recorded: Action[] = [];
  const recorder = () => (next: (a: unknown) => unknown) => (action: unknown) => {
    recorded.push(action as Action);
    return next(action);
  };
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(recorder, sagaMiddleware),
  });
  sagaMiddleware.run(watchKeyboardEventsSaga);
  return { store, recorded };
}

describe('watchKeyboardEventsSaga', () => {
  beforeEach(() => {
    h.emit = undefined;
    vi.clearAllMocks();
  });

  it('runs a known key and puts the built action', async () => {
    const { recorded } = buildHarness();
    await flush();

    h.emit!('command+k');
    await flush();

    expect(recorded).toContainEqual(setPaletteOpen(true));
  });

  it('puts nothing when the run result is null', async () => {
    const { recorded } = buildHarness();
    await flush();
    const before = recorded.length;

    // No tour is active in a fresh store, so `right`'s run returns null.
    h.emit!('right');
    await flush();

    expect(recorded.length).toBe(before);
  });

  it('skips an unknown key', async () => {
    const { recorded } = buildHarness();
    await flush();
    const before = recorded.length;

    h.emit!('enter');
    await flush();

    expect(recorded.length).toBe(before);
  });

  it('puts every action of a multi-action entry in order', async () => {
    const { recorded } = buildHarness();
    await flush();
    const before = recorded.length;

    h.emit!('escape');
    await flush();

    const after = recorded.slice(before);
    expect(after).toEqual([clearSelection(), exitTour(), stopClip()]);
  });
});
