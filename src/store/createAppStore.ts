/**
 * createAppStore — a FACTORY that builds a fresh Redux store per call.
 *
 * The reference shape (RTK `configureStore` + saga middleware + `run(mainSaga)`)
 * is module-singleton in most apps. skymap diverges deliberately: it constructs
 * engines repeatedly across the test suite, and a shared singleton store would
 * leak settings state from one engine into the next. A factory hands each engine
 * (and each test) its own isolated store, so there is no cross-construction
 * bleed.
 *
 * The saga middleware is wired and `mainSaga` is run at construction — see
 * `rootSaga`, which now forks its first feature saga (the tier watcher). Running
 * the root here means the seam's later phases add feature sagas without touching
 * this factory.
 *
 * The factory ALSO hands back a `setSagaContext` setter, delegating to
 * redux-saga's `sagaMiddleware.setContext`. The store is a state container;
 * registering a saga's runner (an engine resource the saga calls into) is a
 * DISTINCT capability, kept un-braided from the store by returning it as its own
 * value rather than bolting it onto the store object. The engine calls
 * `setSagaContext({ runTierTransition })` post-construction to inject the
 * tier-transition runner; `getContext('runTierTransition')` inside the running
 * saga reads it back. That `setContext`/`getContext` pair is how an engine
 * resource crosses from engine-land into store-land without the saga importing
 * the engine.
 *
 * Notably absent: NO `serializableCheck: false` and NO `enableMapSet`. The whole
 * point of this migration is that the settings state is now fully serializable —
 * `disabledPasses` is a plain `Record`, not a `Set` — so RTK's default
 * serializability + immutability checks are kept on as a correctness guard rather
 * than disabled. Re-introducing either escape hatch would silently re-admit the
 * non-serializable shapes the migration removed.
 */

import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from './rootReducer';
import { mainSaga } from './rootSaga';
import type { RootState, SagaContext } from './types';

// The store's preloaded shape is a partial route map: a caller may seed `tier`
// and/or `settings` (both optional) and leave the rest to each slice's
// `initialState`. `Partial<RootState>` is exactly RTK's `preloadedState`
// contract, so a settings-only or tier-only seed both type-check.
export type PreloadedState = Partial<RootState>;

export function createAppStore(preloadedState?: PreloadedState) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(mainSaga);
  return { store, setSagaContext: (ctx: Partial<SagaContext>) => sagaMiddleware.setContext(ctx) };
}
