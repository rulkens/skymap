/**
 * watchTourKeyboardSaga tests — integration over a real store + saga middleware,
 * with `createKeyboardListener` mocked so no real `hotkeys-js`/DOM is involved.
 *
 * The mock returns a real redux-saga `eventChannel` whose `emit` and a `closes`
 * counter are exposed on a hoisted holder, so a test can push synthetic keys
 * (`h.emit('right')`) and assert the channel was torn down (`h.closes`). A
 * recorder middleware captures every dispatched action so we can assert the
 * reducer-less tour signals (`advanceTour` / `prevBeat` / `togglePause`).
 *
 * ### Timing
 *
 * An `eventChannel` emit is delivered on a macrotask boundary, so one `flush()`
 * lets the saga's `take(channel)` pick it up and `put` the mapped action.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Action } from '@reduxjs/toolkit';

// Hoisted holder the mock writes into — vi.mock factories are hoisted above the
// module body, so the shared handle must be created with vi.hoisted.
const h = vi.hoisted(() => ({
  emit: undefined as undefined | ((key: string) => void),
  closes: 0,
  keys: '',
}));

vi.mock('../../../src/services/input/createKeyboardListener', async () => {
  const { eventChannel } = await import('redux-saga');
  return {
    createKeyboardListener: (keys: string) => {
      h.keys = keys;
      return eventChannel<string>((emit) => {
        h.emit = emit;
        return () => {
          h.closes += 1;
        };
      });
    },
  };
});

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTourKeyboardSaga } from '../../../src/state/tour/watchTourKeyboardSaga';
import { tourStarted, tourEnded } from '../../../src/state/tour/tourSlice';
import { advanceTour, prevBeat, togglePause } from '../../../src/state/tour/tourActions';

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
  sagaMiddleware.run(watchTourKeyboardSaga);
  return { store, recorded };
}

describe('watchTourKeyboardSaga', () => {
  beforeEach(() => {
    h.emit = undefined;
    h.closes = 0;
    h.keys = '';
    vi.clearAllMocks();
  });

  it('binds the tour nav keys on tourStarted', async () => {
    const { store } = buildHarness();
    store.dispatch(tourStarted({ tourId: 'webShowcase' }));
    await flush();
    expect(h.keys).toBe('right,left,space');
    expect(h.emit).toBeTypeOf('function');
  });

  it('maps right/left/space to advanceTour/prevBeat/togglePause', async () => {
    const { store, recorded } = buildHarness();
    store.dispatch(tourStarted({ tourId: 'webShowcase' }));
    await flush();

    h.emit!('right');
    await flush();
    h.emit!('left');
    await flush();
    h.emit!('space');
    await flush();

    expect(recorded).toContainEqual(advanceTour());
    expect(recorded).toContainEqual(prevBeat());
    expect(recorded).toContainEqual(togglePause());
  });

  it('ignores an unmapped key', async () => {
    const { store, recorded } = buildHarness();
    store.dispatch(tourStarted({ tourId: 'webShowcase' }));
    await flush();
    const before = recorded.length;

    h.emit!('enter');
    await flush();

    // No tour signal dispatched for an unmapped key.
    expect(recorded.length).toBe(before);
  });

  it('closes the channel on tourEnded', async () => {
    const { store } = buildHarness();
    store.dispatch(tourStarted({ tourId: 'webShowcase' }));
    await flush();
    expect(h.closes).toBe(0);

    store.dispatch(tourEnded());
    await flush();
    expect(h.closes).toBe(1);
  });

  it('rebinds on a superseding tourStarted, closing the prior channel', async () => {
    const { store } = buildHarness();
    store.dispatch(tourStarted({ tourId: 'webShowcase' }));
    await flush();
    expect(h.closes).toBe(0);

    // A second tourStarted supersedes the first run (takeLatest): the old block
    // is cancelled, its finally closes the prior channel, and a new one binds.
    store.dispatch(tourStarted({ tourId: 'demo' }));
    await flush();
    expect(h.closes).toBe(1);
    expect(h.emit).toBeTypeOf('function');
  });
});
