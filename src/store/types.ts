/**
 * Store types — the derived store types every call site reads the store through,
 * plus the saga-context contract types the factory and the feature sagas share.
 *
 * `RootState`, `AppStore`, and `AppDispatch` are all derived (never hand-authored)
 * so they can't drift from the actual store: `RootState` follows the reducer
 * combine, `AppStore` follows the factory's store property, and `AppDispatch`
 * follows the store's wired middleware (thunk + saga). Centralising them here means
 * a component or hook annotates against one import rather than re-deriving
 * `ReturnType<typeof rootReducer>` at every selector.
 *
 * `AppStore` now indexes `['store']` because the factory no longer returns the
 * bare store: it returns `{ store, setSagaContext }`, keeping the state container
 * and the saga-context setter as two distinct values (see `createAppStore`).
 * Indexing the `store` member keeps `AppStore` (and the `AppDispatch` derived from
 * it) pointed at the container, unchanged for every consumer.
 *
 * The saga-context types describe the engine capabilities that cross into
 * store-land: `RunTierTransition` is the engine-owned runner that reacts to a
 * confirmed tier change (drive the per-source data load + famous rebuild);
 * `ReconcileEffects` (see `./effects/ReconcileEffects`) is the bag of render-wake /
 * fade / reseed / bias closures the reconcile sagas invoke; `resolveDeps` is
 * the lazy live-resource read the selection reconciler uses to turn a `SelectionRef`
 * into a `SelectionRow` (read lazily each call so the reconciler always sees the
 * current catalog and structure state — render-wake is reused from
 * `reconcile.requestRender`, not re-added here); `cameraRuntime` is the
 * live camera read `watchFocusTween` uses to build a focus tween — the visible
 * from-pose plus the lens FOV, or null when the camera is not ready; and
 * `playClip` is the engine's clip-player — the tour saga calls it with a
 * `ClipData` and awaits the returned Promise, which resolves when the clip
 * completes or is cancelled by the engine. `SagaContext` is the bag the
 * running root saga reads them back out of via `getContext`; `SetSagaContext` is
 * the setter the factory hands back so the engine can inject them
 * post-construction (a `Partial`, so each registration site supplies only what it
 * knows). They live here, beside the store types, because the sagas and the
 * factory both depend on them and neither owns the other.
 *
 * The imports are type-only, so there is no runtime cycle even though
 * `createAppStore` imports `rootReducer` and this file imports both — `import type`
 * is erased before the module graph is evaluated.
 */

import type { rootReducer } from './rootReducer';
import type { createAppStore } from './createAppStore';
import type { ReconcileEffects } from './effects/ReconcileEffects';
import type { ResolveDeps } from '../@types/engine/ResolveDeps';
import type { Tier } from '../@types/data/Tier';
import type { CameraPose } from '../@types/camera/CameraPose';
import type { ClipData } from '../@types/animation/ClipData';

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>['store'];
export type AppDispatch = AppStore['dispatch'];

export type RunTierTransition = (prevTier: Tier, nextTier: Tier) => void;
/**
 * The live camera Resources `watchFocusTween` reads to seed a tween: the visible
 * `from` pose (what the user sees this frame, so a re-focus hands off smoothly)
 * and the projection FOV (the structure arm frames a cluster to screen-fill).
 */
export type FocusCameraRuntime = { from: CameraPose; fovYRad: number };
export type SagaContext = {
  runTierTransition: RunTierTransition; // already present — drives per-source data load on tier change
  reconcile: ReconcileEffects; // already present — provides requestRender + fade/reseed/bias
  /** Live engine resources the selection reconciler reads to turn a SelectionRef into a SelectionRow. */
  resolveDeps: () => ResolveDeps;
  /**
   * The live camera resources `watchFocusTween` reads to build the tween, or
   * null when the camera is not ready (pre-bootstrap / post-destroy) — the focus
   * tween then no-ops.
   */
  cameraRuntime: () => FocusCameraRuntime | null;
  /**
   * Plays a data clip and resolves when the clip completes or is cancelled.
   * The tour saga awaits this Promise for the establishing fly and races it
   * (as dwellDrift) against the dwell timer during the interactive dwell.
   * Engine registration (createPlayClip + setSagaContext) is a separate task;
   * tests inject a stub via sagaMiddleware.setContext.
   */
  playClip: (clip: ClipData) => Promise<void>;
};
export type SetSagaContext = (ctx: Partial<SagaContext>) => void;
