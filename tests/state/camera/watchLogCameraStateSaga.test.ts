/**
 * watchLogCameraStateSaga tests — integration over a real store + saga
 * middleware, with the engine's `reconcile.logCameraState` effect stubbed via
 * `sagaMiddleware.setContext` (mirroring `watchGoHomeSaga.test.ts`).
 * `logCameraState` is a plain action, so the saga is driven purely by
 * dispatching it and flushing a macrotask.
 */

import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchLogCameraStateSaga } from '../../../src/state/camera/watchLogCameraStateSaga';
import { logCameraState } from '../../../src/state/camera/logCameraState';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchLogCameraStateSaga', () => {
  it('calls the reconcile log-camera effect once when logCameraState is dispatched', async () => {
    const logCameraStateFx = vi.fn<() => void>();
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(sagaMiddleware) });
    sagaMiddleware.setContext({ reconcile: { logCameraState: logCameraStateFx } });
    sagaMiddleware.run(watchLogCameraStateSaga);

    store.dispatch(logCameraState());
    await flush();

    expect(logCameraStateFx).toHaveBeenCalledTimes(1);
  });
});
