/**
 * ReconcileEffects — engine-side callbacks a saga can invoke without knowing the
 * engine's internals.
 *
 * Sagas live inside the store layer and are constructed before the engine exists.
 * Coupling them directly to renderer/scheduler/fade types would entangle the store
 * with the engine's concrete implementation. Instead, the engine registers plain
 * closures here after construction (via `setSagaContext`), and sagas reach outward
 * only through this narrow surface.
 *
 * Each method represents a distinct engine concern that a saga might need to
 * trigger in response to a dispatched action:
 *   requestRender  — wakes the render-on-demand scheduler
 *   syncFades      — re-syncs every intent→fade row; cheap on every settings
 *                    write because a row whose target hasn't moved costs
 *                    `applyIntent` one `targetOf` lookup, not a fade restart
 *   logCameraState — prints the current orbit-camera pose (debug aid, the
 *                    `l` key) and returns the rendered pose + sim instant for
 *                    the share-URL log, or null when the camera isn't ready
 *   applySwapFormat — reconfigures the swap chain to the given format and
 *                    rebuilds the renderers whose pipelines bake it (the HDR
 *                    display toggle and display-capability changes)
 *
 * This boundary is kept deliberately small: the tour's scene capture is a pure
 * store read (`captureScene` selector) and its restore is pure Intent
 * (`restoreSceneSaga` puts `mergeSnapshot` + `updateSelectionFocus`); the restore
 * fade rides the EXISTING `syncFades` reactively (watchFadesSaga reacts to
 * every settings write, `mergeSnapshot` included), so no restore-specific
 * effect is added here.
 */

import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';

export type ReconcileEffects = {
  requestRender: () => void;
  syncFades: () => void;
  logCameraState: () => { readonly framed: FramedCameraPose; readonly simDays: number } | null;
  applySwapFormat: (desired: GPUTextureFormat) => void;
};
