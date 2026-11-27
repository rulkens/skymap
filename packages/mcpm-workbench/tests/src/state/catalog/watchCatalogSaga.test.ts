/**
 * watchCatalogSaga — `resolveCatalogPointsPlan`'s priority order, and the one
 * trigger that must NOT reload: a mis-wired trigger that never loads is
 * impossible to miss, a needless reload silently restarts the run.
 */
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { describe, expect, it, vi } from 'vitest';
import { resolveCatalogPointsPlan } from '../../../../src/catalog/resolveCatalogPointsPlan';
import {
  catalogLoaded,
  setCatalogSources,
  setCatalogTier,
  userCatalogLoaded,
} from '../../../../src/state/catalog/catalogSlice';
import { watchCatalogSaga } from '../../../../src/state/catalog/watchCatalogSaga';
import { rootReducer } from '../../../../src/store/rootReducer';
import type { CatalogPoints } from '../../../../@types/catalog/CatalogPoints';
import type { UserCatalog } from '../../../../@types/catalog/UserCatalog';

const userPoints: CatalogPoints = {
  positions: new Float32Array([1, 2, 3]),
  weight: new Float32Array([4]),
  count: 1,
  sources: [],
};

const userCatalog: UserCatalog = {
  points: userPoints,
  fileName: 'desi.csv',
  settings: { format: { kind: 'cartesianMpc' }, weight: { kind: 'linear', scale: 1 } },
  weightStats: { min: 4, median: 4, max: 4 },
};

describe('resolveCatalogPointsPlan', () => {
  it('plan carries the loaded catalog when it is on', () => {
    const plan = resolveCatalogPointsPlan(
      { userCatalog, userCatalogOn: true, sources: ['sdss'], tier: 'medium' },
      false,
    );

    expect(plan).toEqual({ kind: 'load', sources: ['sdss'], tier: 'medium', userCatalog });
  });

  it('plan carries no loaded catalog when it is off', () => {
    const plan = resolveCatalogPointsPlan(
      { userCatalog, userCatalogOn: false, sources: ['sdss', 'glade'], tier: 'large' },
      false,
    );

    expect(plan).toEqual({
      kind: 'load',
      sources: ['sdss', 'glade'],
      tier: 'large',
      userCatalog: null,
    });
  });

  it('the probe gate still wins', () => {
    const plan = resolveCatalogPointsPlan(
      { userCatalog, userCatalogOn: true, sources: ['sdss'], tier: 'medium' },
      true,
    );

    expect(plan).toEqual({ kind: 'synthetic' });
  });
});

describe('watchCatalogSaga', () => {
  it('a tier change with no built-in source on keeps the loaded points, so the run does not restart', async () => {
    const loads: Action[] = [];
    const record: Middleware = () => (next) => (action) => {
      if (catalogLoaded.match(action)) loads.push(action as Action);
      return next(action);
    };
    const saga = createSagaMiddleware();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, immutableCheck: false }).concat(record, saga),
    });
    saga.run(watchCatalogSaga);

    store.dispatch(setCatalogSources([]));
    await vi.waitFor(() => expect(loads).toHaveLength(1));
    store.dispatch(userCatalogLoaded({ catalog: userCatalog, fitBounds: null }));
    await vi.waitFor(() => expect(loads).toHaveLength(2));
    store.dispatch(setCatalogTier('large'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loads).toHaveLength(2);
  });
});
