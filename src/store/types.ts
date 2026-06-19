/**
 * Store types — the derived store types every call site reads the store through,
 * plus the saga-context contract types the factory and the feature sagas share.
 *
 * `RootState`, `AppStore`, and `AppDispatch` are all derived (never hand-authored)
 * so they can't drift from the actual store: `RootState` follows the reducer
 * combine, `AppStore` follows the factory's return type, and `AppDispatch` follows
 * the store's wired middleware (thunk + saga). Centralising them here means a
 * component or hook annotates against one import rather than re-deriving
 * `ReturnType<typeof rootReducer>` at every selector.
 *
 * `AppStore` now indexes `['store']` because the factory no longer returns the
 * bare store: it returns `{ store, setSagaContext }`, keeping the state container
 * and the saga-context setter as two distinct values (see `createAppStore`).
 * Indexing the `store` member keeps `AppStore` (and the `AppDispatch` derived from
 * it) pointed at the container, unchanged for every consumer.
 *
 * The saga-context types describe the one engine capability that crosses into
 * store-land: `RunTierTransition` is the engine-owned runner that reacts to a
 * confirmed tier change (drive the per-source data load + famous rebuild);
 * `SagaContext` is the bag the running root saga reads it back out of via
 * `getContext`; `SetSagaContext` is the setter the factory hands back so the
 * engine can inject the runner post-construction. They live here, beside the
 * store types, because the saga and the factory both depend on them and neither
 * owns the other.
 *
 * The imports are type-only, so there is no runtime cycle even though
 * `createAppStore` imports `rootReducer` and this file imports both — `import type`
 * is erased before the module graph is evaluated.
 */

import type { rootReducer } from './rootReducer';
import type { createAppStore } from './createAppStore';
import type { Tier } from '../@types/data/Tier';

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>['store'];
export type AppDispatch = AppStore['dispatch'];

export type RunTierTransition = (prevTier: Tier, nextTier: Tier) => void;
export type SagaContext = { runTierTransition: RunTierTransition };
export type SetSagaContext = (ctx: Partial<SagaContext>) => void;
