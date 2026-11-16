/**
 * watchTierSaga — integration tests over a real store + saga middleware, asserting the
 * observable outcome. Each test builds a FRESH store: `takeLatest` carries per-store worker
 * state. Flush a macrotask after each dispatch; the saga schedules its continuation on one.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTierSaga } from '../../../src/state/tier/watchTierSaga';
import { requestTier } from '../../../src/state/tier/requestTier';
import { setTier } from '../../../src/state/tier/tierSlice';
import { selectTier } from '../../../src/state/tier/selectors';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function buildStore(log: Action[] = []) {
  const record: Middleware = () => (next) => (action) => {
    log.push(action as Action);
    return next(action);
  };
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(record, sagaMiddleware),
  });
  sagaMiddleware.run(watchTierSaga);
  return store;
}

describe('watchTierSaga', () => {
  it('writes the tier', async () => {
    const store = buildStore();

    store.dispatch(requestTier('large'));
    await flush();

    expect(selectTier(store.getState())).toBe('large');
  });

  it('re-requesting the current tier is a no-op', async () => {
    // State can't show it (setTier to the same tier is a no-op reducer); the action can,
    // and sagas such as the Milky Way star reseed act on every setTier.
    const log: Action[] = [];
    const store = buildStore(log);
    store.dispatch(requestTier('large'));
    await flush();
    log.length = 0;

    store.dispatch(requestTier('large'));
    await flush();

    expect(log.filter(setTier.match)).toEqual([]);
  });
});
