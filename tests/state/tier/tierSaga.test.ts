/**
 * tierSaga — integration tests over a real store + saga middleware.
 *
 * Rather than driving the generator by hand (which couples the test to the
 * exact effect sequence), these tests run the watcher inside an actual store
 * wired with `redux-saga`, dispatch the `requestTier` command, and assert on
 * the observable outcome: the store's tier and whether the injected
 * `runTierTransition` runner fired. That keeps the tests honest about the
 * command/write split and the same-tier no-op without freezing the saga's
 * internal steps.
 *
 * Each test builds a FRESH store, because `takeLatest` carries per-store
 * worker state and the same-tier no-op test depends on the watcher's prior view
 * of the current tier. A flushed macrotask (`setTimeout(…, 0)`) after each
 * dispatch lets the `takeLatest` worker run to completion — a bare
 * `Promise.resolve()` microtask is not enough, since the saga schedules its
 * continuation on a macrotask.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTier } from '../../../src/state/tier/tierSaga';
import { requestTier } from '../../../src/state/tier/requestTier';
import { selectTier } from '../../../src/state/tier/selectors';
import type { RunTierTransition } from '../../../src/store/types';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('watchTier', () => {
  let store: ReturnType<typeof buildStore>;
  let runner: ReturnType<typeof vi.fn<RunTierTransition>>;

  function buildStore() {
    const sagaMiddleware = createSagaMiddleware();
    const built = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
    });
    sagaMiddleware.run(watchTier);
    runner = vi.fn<RunTierTransition>();
    sagaMiddleware.setContext({ runTierTransition: runner });
    return built;
  }

  beforeEach(() => {
    store = buildStore();
  });

  it('writes the new tier and runs the transition once', async () => {
    store.dispatch(requestTier('large'));
    await flush();

    expect(selectTier(store.getState())).toBe('large');
    expect(runner).toHaveBeenCalledTimes(1);
    // 'medium' is the boot default the tier slice seeds; the runner sees the
    // PREVIOUS tier first so its per-source diff stays honest.
    expect(runner).toHaveBeenCalledWith('medium', 'large');
  });

  it('is a no-op for a same-tier request', async () => {
    store.dispatch(requestTier('large'));
    await flush();
    runner.mockClear();

    store.dispatch(requestTier('large')); // already 'large'
    await flush();

    expect(runner).not.toHaveBeenCalled();
    expect(selectTier(store.getState())).toBe('large');
  });
});
