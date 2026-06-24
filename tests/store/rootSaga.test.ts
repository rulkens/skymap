/**
 * rootSaga tests — confirms that mainSaga composes and starts without throwing
 * even when no ReconcileEffects context is registered.
 *
 * Safety guarantee: each watcher's worker body calls getContext only when an
 * action arrives. With no action dispatched the workers never run, so missing
 * context keys are never dereferenced. This test pins that guarantee for the
 * full watcher set:
 *   watchTier, watchWake, watchFlowReseed, watchBiasBake, watchFades,
 *   watchSelectionRows, watchSelectionWake, watchRequestFocus,
 *   watchFocusTween, watchTour.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from '../../src/store/rootReducer';
import { mainSaga } from '../../src/store/rootSaga';

describe('rootSaga', () => {
  it('runs mainSaga without throwing even with no reconcile context registered', () => {
    // No setContext call — simulates the window between store construction
    // and engine context registration.
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
    });
    // sagaMiddleware.run must not throw for the root to be safe.
    expect(() => sagaMiddleware.run(mainSaga)).not.toThrow();
    // Store state must remain intact — the saga startup path doesn't corrupt it.
    expect(store.getState().settings).toBeDefined();
  });
});
