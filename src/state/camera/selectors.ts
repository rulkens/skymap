/**
 * Camera selectors — the single read seam for the RTK camera slice, scoped
 * through `RootState`.
 *
 * One consolidated module: this mirrors the settings and tier slice conventions
 * (one read surface per slice), so any new camera selectors land here rather
 * than as parallel one-function files.
 *
 * `selectCameraIntent` is the base selector — it lifts the camera slice out of
 * `RootState` via `cameraRoute`. Every other selector composes through it, so
 * the slice route is named exactly once. Every selector is `RootState`-scoped,
 * so the same function drops into BOTH the React side
 * (`useAppSelector(selectCameraActive)`) and the engine side
 * (`selectCameraActive(store.getState())`) unchanged.
 *
 * `selectCameraActive` is the camera term of the render-loop continuation
 * predicate (spec §4): it returns true whenever any non-resting driver is in
 * play — a drag in progress, an active tween, or auto-rotate spinning.
 * `shouldKeepTicking` ORs it with the non-camera movers (thumbnails, fades,
 * structure-focus, animated flow) to decide whether the loop reschedules. A new
 * camera driver with its own active flag adds that flag here too, so this
 * selector stays the one definition of 'the camera is moving'.
 *
 * `selectAutoRotate` reads the camera slice exclusively — the settings-side
 * `camera.autoRotate` field and its selector have been removed. The App toggle
 * dispatches `setAutoRotate({ active, rate })` directly to this slice.
 */

import { cameraRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { CameraState } from '../../@types/camera/CameraState';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';

export const selectCameraIntent = (state: RootState): CameraState => state[cameraRoute];

// The FRAMED base (spec §9): readers that are world-arm concerns by nature
// resolve it through `resolveWorldArm` / `liveWorldPose` rather than assuming
// the absolute arm.
export const selectCameraBase = (state: RootState): FramedCameraPose =>
  selectCameraIntent(state).base;

export const selectAutoRotate = (state: RootState): boolean =>
  selectCameraIntent(state).autoRotate.active;

export const selectAutoRotateRate = (state: RootState): number =>
  selectCameraIntent(state).autoRotate.rate;

// Camera term of the loop-continuation predicate (spec §4): true while any
// non-resting driver would win. `shouldKeepTicking` ORs this with the other
// movers to decide whether to reschedule the next frame. The clip term keeps
// the loop alive for the full duration of an animation clip; the frameTween
// term keeps it alive through an orientation-frame roll's up-basis slerp.
export const selectCameraActive = (state: RootState): boolean => {
  const c = selectCameraIntent(state);
  return (
    c.clip !== null ||
    c.dragging ||
    c.tween !== null ||
    c.autoRotate.active ||
    c.frameTween !== null
  );
};

// True while an animation clip is playing. Plan B/C's `suspendDuringClip`
// guard and React-side clip-aware components read this rather than
// reaching into the camera slice directly.
export const selectClipActive = (state: RootState): boolean =>
  selectCameraIntent(state).clip !== null;
