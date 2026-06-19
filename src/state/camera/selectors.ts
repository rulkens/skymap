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
 * `selectCameraActive` is the render-loop continuation predicate (spec §4): it
 * returns true whenever any non-resting driver is in play — a drag in progress,
 * an active tween, or auto-rotate spinning. The engine frame loop reschedules
 * itself only while this is true, so adding a new driver means adding its flag
 * to this selector, not hunting through the engine loop body.
 *
 * Note: `selectAutoRotate` reuses the same name as the settings selector in
 * `src/state/settings/selectors.ts` but reads the CAMERA slice. Both coexist
 * with different import paths until Task 5.x removes the settings-side one.
 */

import { cameraRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { CameraState } from '../../@types/camera/CameraState';
import type { CameraPose } from '../../@types/camera/CameraPose';

export const selectCameraIntent = (state: RootState): CameraState => state[cameraRoute];

export const selectCameraBase = (state: RootState): CameraPose => selectCameraIntent(state).base;

export const selectAutoRotate = (state: RootState): boolean =>
  selectCameraIntent(state).autoRotate.active;

// Loop-continuation predicate (spec §4): true while any non-resting driver
// would win. The engine reschedules the next frame only while this is true.
export const selectCameraActive = (state: RootState): boolean => {
  const c = selectCameraIntent(state);
  return c.dragging || c.tween !== null || c.autoRotate.active;
};
