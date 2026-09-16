/**
 * EngineCallbacks — the non-callback options injected into `createEngine`.
 *
 * Both members are plain values, not event callbacks: the Redux `store` and
 * the saga-context setter. The engine reads settings from `store.getState()`
 * and dispatches all observable state changes (status, scale, source counts,
 * load progress, selection) directly to the store. React consumers read via
 * `useAppSelector` selectors — there is no callback cluster to subscribe to.
 */

import type { AppStore, SetSagaContext, RunSaga } from '../../store/types';

export type EngineCallbacks = {
  /**
   * The injected Redux store created once at the app root (`main.tsx`) and
   * shared with React via `<Provider>`.  The engine reads settings from it
   * (`store.getState().settings`) and dispatches the write path through it,
   * so the engine and React drive one authoritative instance with no mirror.
   */
  store: AppStore;

  /**
   * Registers the engine's saga runners into the store's saga context.  The
   * engine builds its closures over the live `EngineState` and hands them to the
   * running root saga through this setter, which the store factory exposes
   * alongside the store — the `ReconcileEffects` bag (the render-wake / fade /
   * reseed / bias closures the reconcile sagas invoke) among them.
   *
   * Sourced from `<SagaContextProvider>` in `useEngine`, mirroring how `store`
   * rides here from `<Provider>` — both are sibling returns of `createAppStore`,
   * injected through React context rather than threaded as props through `App`.
   */
  setSagaContext: SetSagaContext;

  /**
   * Forks a watcher saga under `createAppStore`'s middleware. `createLayers`
   * calls this once per composed Layer's declared `sagas`, at Layer-creation
   * time — the only way a Layer's saga ever runs, since `mainSaga` cannot
   * import the composition. Sourced from `<RunSagaProvider>`, the third
   * sibling of `createAppStore`'s return.
   */
  runSaga: RunSaga;
};
