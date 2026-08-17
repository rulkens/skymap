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
 * `setSagaContext` post-construction with a bag carrying, among the rest, the
 * tier-transition runner; `getContext('runTierTransition')` inside the running
 * saga reads it back. That `setContext`/`getContext` pair is how an engine
 * resource crosses from engine-land into store-land without the saga importing
 * the engine.
 *
 * `setSagaContext` is the outward seam for engine-side closures. Sagas live
 * entirely in the store layer and have no compile-time access to the engine's
 * scheduler, renderers, or fade bridge. After constructing the engine, callers
 * register plain closures (typed as `ReconcileEffects`) via `setSagaContext`; the
 * saga middleware merges them into the running root saga's context where feature
 * sagas can retrieve them with `getContext`. This keeps the store/saga layer free
 * of engine imports while still letting sagas trigger engine effects.
 *
 * Registering the context also DISPATCHES `sagaContextRegistered`. `setContext`
 * alone is invisible from inside a saga — `getContext` yields `undefined` rather
 * than blocking — which is fine for every watcher woken by an action, and not
 * fine for the one saga that dispatches unprompted at construction (the hash
 * arrival read). The action is what `watchHashSaga` waits on before it forks
 * either half of the bridge.
 *
 * That is why the setter takes a WHOLE `SagaContext` rather than a `Partial`: the
 * dispatch announces "the capabilities the sagas reach for are registered", and
 * only a total argument makes the announcement true by construction. See
 * `SetSagaContext` in `./types` for what a partial registration costs.
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
import { sagaContextRegistered } from './sagaContextRegistered';
import type { RootState, SagaContext } from './types';

// The store's preloaded shape is a partial route map: a caller may seed any
// subset of the routes (`tier`, `settings`, `ui` — all optional) and leave the
// rest to each slice's `initialState`. `Partial<RootState>` is exactly RTK's
// `preloadedState` contract, so a settings-only, tier-only, or ui-only seed all
// type-check. (The `ui` slice self-seeds from `buildInitialUiState()` when
// omitted; main.tsx seeds it explicitly for a fresh boot-time localStorage read.)
export type PreloadedState = Partial<RootState>;

export function createAppStore(preloadedState?: PreloadedState) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(mainSaga);
  return {
    store,
    // The dispatch after the merge is what makes registration OBSERVABLE. A saga
    // that must dispatch on its own initiative — `watchHashReadSaga`'s arrival
    // read is the only one — cannot use `getContext` to find out whether the bag
    // it is about to feed exists yet, because `getContext` returns `undefined`
    // instead of blocking. The action gives it something to `take`. Ordering
    // matters: merge first, announce second, so a saga woken by the announcement
    // already sees the context.
    setSagaContext: (ctx: SagaContext) => {
      sagaMiddleware.setContext(ctx);
      store.dispatch(sagaContextRegistered());
    },
  };
}
