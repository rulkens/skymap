/**
 * watchTierSaga — integration tests over a real store + saga middleware, asserting the
 * observable outcome. Each test builds a FRESH store: `takeLatest` carries per-store worker
 * state. Flush a macrotask after each dispatch; the saga schedules its continuation on one.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTierSaga } from '../../../src/state/tier/watchTierSaga';
import { requestTier } from '../../../src/state/tier/requestTier';
import { selectTier } from '../../../src/state/tier/selectors';
import {
  updateSelectionSelect,
  updateSelectionHover,
} from '../../../src/state/selection/selectionSlice';
import { selectionRoute } from '../../../src/store/constants';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function buildStore() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(watchTierSaga);
  return store;
}

describe('watchTierSaga', () => {
  it('writes the tier and nothing else', async () => {
    const store = buildStore();
    const hover = { type: 'galaxyCatalog' as const, source: 'sdss', index: 0 };
    const select = { type: 'structure' as const, id: 'cluster-virgo' };
    store.dispatch(updateSelectionHover(hover));
    store.dispatch(updateSelectionSelect(select));

    store.dispatch(requestTier('large'));
    await flush();

    expect(selectTier(store.getState())).toBe('large');
    expect(store.getState()[selectionRoute].hover).toEqual(hover);
    expect(store.getState()[selectionRoute].select).toEqual(select);
  });

  it('re-requesting the current tier is a no-op', async () => {
    const store = buildStore();
    store.dispatch(requestTier('large'));
    await flush();
    const before = store.getState();

    store.dispatch(requestTier('large'));
    await flush();

    expect(store.getState()).toBe(before);
  });
});
