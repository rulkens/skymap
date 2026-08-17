/**
 * reconcileSagaHarness — shared test harness for the reconcile watcher sagas
 * (watchWakeSaga, watchFadesSaga, watchFlowReseedSaga, watchBiasBakeSaga,
 * watchSwapFormatSaga).
 *
 * Each saga lives in its own file with its own spec, but they all consume the
 * same ReconcileEffects surface and several writes fan out across more than one
 * watcher (a setFlow patch hits both watchFadesSaga and watchFlowReseedSaga;
 * setHdrEnabled hits both watchWakeSaga's requestRender and
 * watchSwapFormatSaga). Running ALL of them under a shared root here lets each
 * spec assert its own effect while the cross-saga fan-out stays faithful to
 * production.
 *
 * Harness: a real RTK configureStore + redux-saga middleware with
 * ReconcileEffects spies injected via setContext before the watchers run. Build
 * a fresh store per test (beforeEach) to avoid cross-test spy bleed.
 */

import { vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all } from 'typed-redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchWakeSaga } from '../../../src/store/effects/watchWakeSaga';
import { watchFadesSaga } from '../../../src/store/effects/watchFadesSaga';
import { watchFlowReseedSaga } from '../../../src/store/effects/watchFlowReseedSaga';
import { watchBiasBakeSaga } from '../../../src/store/effects/watchBiasBakeSaga';
import { watchSwapFormatSaga } from '../../../src/store/effects/watchSwapFormatSaga';
import type { VisibilityLayerKey } from '../../../src/@types/animation/VisibilityLayerKey';
import type { BiasMode } from '../../../src/@types/data/galaxyCatalog/BiasMode';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

// A real reconcile spy object matching the ReconcileEffects surface. Typed
// vi.fn<...>() throughout — bare vi.fn() fails tsc against typed callback fields.
export type ReconcileSpies = {
  requestRender: ReturnType<typeof vi.fn<() => void>>;
  syncFades: ReturnType<typeof vi.fn<(rows?: readonly VisibilityLayerKey[]) => void>>;
  reseedFlow: ReturnType<typeof vi.fn<() => void>>;
  bakeBias: ReturnType<typeof vi.fn<(mode: BiasMode) => void>>;
  applySwapFormat: ReturnType<typeof vi.fn<(desired: GPUTextureFormat) => void>>;
};

export function buildStore() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });

  const reconcile: ReconcileEffects = {
    requestRender: vi.fn<() => void>(),
    syncFades: vi.fn<(rows?: readonly VisibilityLayerKey[]) => void>(),
    reseedFlow: vi.fn<() => void>(),
    bakeBias: vi.fn<(mode: BiasMode) => void>(),
    logCameraState: vi.fn<() => void>(),
    applySwapFormat: vi.fn<(desired: GPUTextureFormat) => void>(),
  };

  // setContext BEFORE running the sagas so getContext finds the closures when
  // any dispatched action triggers a worker.
  sagaMiddleware.setContext({ reconcile });

  // Run every watcher under a shared root so they share the context above
  // and cross-saga fan-out (e.g. setFlow → fades + reseed) stays faithful.
  sagaMiddleware.run(function* () {
    yield* all([
      watchWakeSaga(),
      watchFadesSaga(),
      watchFlowReseedSaga(),
      watchBiasBakeSaga(),
      watchSwapFormatSaga(),
    ]);
  });

  return { store, reconcile: reconcile as unknown as ReconcileSpies };
}
