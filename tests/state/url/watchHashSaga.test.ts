/**
 * watchHashSaga — integration over a real store + saga middleware, with the
 * three `services/url` seams mocked so the test owns the URL and no `window` is
 * touched (the suite runs under `environment: 'node'`). The parent is forked,
 * not `mainSaga`: the subject is the gate the parent holds, and a full root fork
 * would drag every other watcher's engine context in for it.
 *
 * ### What these cases are for
 *
 * What each half does with a hash body is tested where that half lives, and both
 * of those files fork their half directly — which they may only do because the
 * gate is not in them. What only THIS file can catch is the parent's own
 * contribution: neither half runs at all until `sagaContextRegistered` lands.
 *
 * Both cases arrive on `#focus=m31`, because a deep link is what an ungated
 * bridge damages, and they watch it from the two sides:
 *
 *  - the read publishing into watchers whose engine context does not exist yet,
 *    where the throw cancels the whole root saga rather than just this one;
 *  - the write composing the store's untouched defaults and `pushState`ing them
 *    over the link the visitor followed.
 *
 * One gate, two observations — not two gates.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { eventChannel } from 'redux-saga';
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';

vi.mock('../../../src/services/url/readHashBody', () => ({ readHashBody: vi.fn(() => '') }));
vi.mock('../../../src/services/url/createHashChangeChannel', () => ({
  createHashChangeChannel: vi.fn(),
}));
vi.mock('../../../src/services/url/writeHashBody', () => ({ writeHashBody: vi.fn() }));

import { readHashBody } from '../../../src/services/url/readHashBody';
import { createHashChangeChannel } from '../../../src/services/url/createHashChangeChannel';
import { writeHashBody } from '../../../src/services/url/writeHashBody';
import { rootReducer } from '../../../src/store/rootReducer';
import { sagaContextRegistered } from '../../../src/store/sagaContextRegistered';
import { watchHashSaga } from '../../../src/state/url/watchHashSaga';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { requestSelect } from '../../../src/state/selection/requestSelect';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';

const write = vi.mocked(writeHashBody);

/**
 * A macrotask — the write half's debounce window. The gate's "nothing yet"
 * assertions do NOT need it (a held saga has no pending worker to wait for), but
 * asserting the absence of a write without giving one the chance to happen would
 * be a test that passes for the wrong reason, so both sides settle alike.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Boot the whole bridge against a given arrival hash. `register` stands in for
 * `createAppStore`'s `setSagaContext` — nothing here populates a saga context,
 * because no watcher that would read one is forked; the only part of
 * registration this file needs is the signal.
 *
 * The channel subscriber is a no-op: these cases never navigate, and the read
 * half's own teardown is covered where it lives.
 */
function buildHarness(arrivalBody: string) {
  vi.mocked(readHashBody).mockReturnValue(arrivalBody);
  vi.mocked(createHashChangeChannel).mockReturnValue(eventChannel<string>(() => () => {}));

  const recorded: Action[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    // The gate signal is this harness's own stimulus, not the bridge's output.
    if (!sagaContextRegistered.match(action)) recorded.push(action as Action);
    return next(action);
  };

  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(recorder, sagaMiddleware),
  });
  sagaMiddleware.run(watchHashSaga);

  return { recorded, store, register: () => store.dispatch(sagaContextRegistered()) };
}

describe('watchHashSaga', () => {
  beforeEach(() => {
    write.mockClear();
  });

  it('holds the arrival read until the saga context is registered', async () => {
    const { recorded, register } = buildHarness('focus=m31');

    // `createAppStore` runs the root saga INSIDE the factory, so an ungated
    // bridge reads the URL before any caller can reach `setSagaContext` — and
    // `requestSelect`/`requestFocus` wake reconcilers that dereference
    // `getContext('resolveDeps')` and `reconcile.requestRender`. Those throws
    // propagate to the root and cancel every sibling watcher, so one deep link
    // costs the session its wake, tier transitions, selection resolution, tour
    // and keyboard.
    await settle();
    expect(recorded).toEqual([]);

    register();
    await settle();

    expect(recorded).toEqual([requestSelect('m31'), requestFocus('m31')]);
  });

  it('holds the write half until the saga context is registered', async () => {
    const { store, register } = buildHarness('focus=m31');

    // A real hash-write trigger that moves no state — the store is already at
    // `DEFAULT_ORIENTATION`. An ungated write half answers it by composing the
    // body from a store that has not seen the URL yet, which is the EMPTY body,
    // and `pushState`ing it over `#focus=m31`. Gating only the read half leaves
    // exactly this open.
    store.dispatch(setOrientation(DEFAULT_ORIENTATION));
    await settle();

    expect(write).not.toHaveBeenCalled();

    register();
    await settle();

    // And the deep link survives: whatever the bridge publishes from here on, it
    // is never the default body composed before the arrival read landed.
    expect(write.mock.calls.map(([body]) => body)).not.toContain('');
  });
});
