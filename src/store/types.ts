/**
 * Store types — derived types every call site reads the store through, plus the
 * saga-context seam that lets the engine register effect closures.
 *
 * `RootState`, `AppStore`, and `AppDispatch` are all derived (never hand-authored)
 * so they can't drift from the actual store: `RootState` follows the reducer
 * combine, `AppStore` follows the factory's store property, and `AppDispatch`
 * follows the store's wired middleware (thunk + saga). Centralising them here means
 * a component or hook annotates against one import rather than re-deriving
 * `ReturnType<typeof rootReducer>` at every selector.
 *
 * `SagaContext` is the runtime context object redux-saga merges into a running root
 * saga via `sagaMiddleware.setContext`. The engine calls `setSagaContext` after
 * construction to register `ReconcileEffects` closures — callbacks sagas invoke
 * without depending on the engine's concrete types. `SetSagaContext` accepts a
 * `Partial` so each registration site only needs to supply what it knows.
 *
 * The imports are type-only, so there is no runtime cycle even though
 * `createAppStore` imports `rootReducer` and this file imports both — `import type`
 * is erased before the module graph is evaluated.
 */

import type { rootReducer } from './rootReducer';
import type { createAppStore } from './createAppStore';
import type { ReconcileEffects } from './effects/ReconcileEffects';

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>['store'];
export type AppDispatch = AppStore['dispatch'];

export type SagaContext = { reconcile: ReconcileEffects };
export type SetSagaContext = (ctx: Partial<SagaContext>) => void;
