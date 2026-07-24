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
 * live camera read `watchFocusTweenSaga` uses to build a focus tween — the visible
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
import type { Vec4 } from '../@types/math/Vec4';
import type { ClipData } from '../@types/animation/ClipData';
import type { ClipId } from '../@types/animation/ClipId';

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>['store'];
export type AppDispatch = AppStore['dispatch'];

export type RunTierTransition = (prevTier: Tier, nextTier: Tier) => void;
/**
 * The live camera Resources the focus and orientation sagas read off the frame
 * loop. `watchFocusTweenSaga` seeds a camera tween from the visible `from` pose
 * (what the user sees this frame, so a re-focus hands off smoothly) and the
 * projection FOV (the structure arm frames a cluster to screen-fill).
 * `watchOrientationChangeSaga` seeds a frame roll from `frameBasisQuat`: the
 * up-basis quaternion resolved THIS frame, so a re-switch mid-slerp composes
 * continuously instead of snapping the pole back to the committed frame. The
 * name is frame-agnostic (not `Focus…`) because both sagas share the snapshot.
 */
export type LiveCameraRuntime = { from: CameraPose; fovYRad: number; frameBasisQuat: Vec4 };
/**
 * The debug clip-path inspector seam — the non-reactive bridge the
 * `watchClipPathInspectSaga` calls to (re)sample a clip's camera route into the
 * `clipPathInspector` subsystem. `compute` takes a resolved `ClipData` (foci
 * already turned into world positions at the action boundary); `clear` drops the
 * held snapshot so the overlay goes quiet. The engine registers it at
 * construction via `createClipPathInspectSeam` + `setSagaContext`; tests inject a
 * stub via `sagaMiddleware.setContext`.
 *
 * `recompute` re-samples with the SAME start pose the last `compute` captured,
 * rather than the current live pose — so the curator can move the camera to view
 * the path and iterate on tuning without the start knot jumping to the new
 * viewpoint (the "Re-calc" button). Everything else (foci, tuning) is fresh.
 *
 * `pinnedClip` returns the foci-resolved, start-pinned `ClipData` the last
 * `compute` produced (null before the first / after `clear`). It is the replay
 * source: `watchReplayInspectedPathSaga` plays it verbatim so the flown route is
 * the inspected overlay exactly, with no fresh `start: 'live'` resolution.
 */
export type ClipPathInspectSeam = {
  compute: (clipId: ClipId, resolved: ClipData) => void;
  recompute: (clipId: ClipId, resolved: ClipData) => void;
  clear: () => void;
  pinnedClip: () => ClipData | null;
};
export type SagaContext = {
  /**
   * The store's own `getState`, seeded by the factory at construction. Feature
   * sagas read it via `getContext('getState')` to hand store-reading seams a
   * live-state reader — e.g. `createKeyboardListener` resolves a per-shortcut
   * `preventDefault` predicate against the current state inside the DOM tick.
   */
  getState: () => RootState;
  runTierTransition: RunTierTransition; // already present — drives per-source data load on tier change
  reconcile: ReconcileEffects; // already present — provides requestRender + fade/reseed/bias
  /** Live engine resources the selection reconciler reads to turn a SelectionRef into a SelectionRow. */
  resolveDeps: () => ResolveDeps;
  /**
   * The live camera resources `watchFocusTweenSaga` and `watchOrientationChangeSaga`
   * read to seed their tweens, or null when the camera is not ready
   * (pre-bootstrap / post-destroy) — both sagas then no-op.
   */
  cameraRuntime: () => LiveCameraRuntime | null;
  /**
   * Plays a data clip and resolves when the clip completes or is cancelled.
   * The tour saga awaits this Promise for the establishing fly and races it
   * (as dwellDrift) against the dwell timer during the interactive dwell.
   * The engine registers this at construction via `createPlayClip` +
   * `setSagaContext`; tests inject a stub via `sagaMiddleware.setContext`.
   */
  playClip: (clip: ClipData) => Promise<void>;
  /**
   * The debug clip-path inspector seam — `watchClipPathInspectSaga` calls
   * `compute` on `inspectClipPath` and `clear` on `clearClipPath`. Engine-
   * registered at construction; null-safe to omit in non-debug saga setups.
   */
  clipPathInspect: ClipPathInspectSeam;
};
export type SetSagaContext = (ctx: Partial<SagaContext>) => void;
