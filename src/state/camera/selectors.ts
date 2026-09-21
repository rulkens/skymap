/**
 * Camera selectors — the single read seam for the RTK camera slice. Every
 * selector is `RootState`-scoped, so the same function serves both the React side
 * (`useAppSelector`) and the engine side (`selector(store.getState())`).
 */

import { cameraRoute } from '../../store/constants';
import { isWorldArm } from '../../services/engine/camera/rungs/isWorldArm';
import type { RootState } from '../../store/types';
import type { CameraState } from '../../@types/camera/CameraState';
import type { CameraTuning } from '../../@types/camera/CameraTuning';

const selectCameraIntent = (state: RootState): CameraState => state[cameraRoute];

export const selectCameraTuning = (state: RootState): CameraTuning =>
  selectCameraIntent(state).tuning;

export const selectAutoRotate = (state: RootState): boolean =>
  selectCameraIntent(state).autoRotate.active;

export const selectAutoRotateRate = (state: RootState): number =>
  selectCameraIntent(state).autoRotate.rate;

// Camera term of the loop-continuation predicate (spec §4). The auto-rotate term
// carries the same arm gate as the driver it stands for: in a body arm the flag is
// stored intent with nothing acting on it, and an ungated term would pin the loop
// at 60 fps. `dragging` is NOT gated — the surface controller is a gesture driver.
export const selectCameraActive = (state: RootState): boolean => {
  const c = selectCameraIntent(state);
  return (
    c.clip !== null ||
    c.dragging ||
    c.tween !== null ||
    (c.autoRotate.active && isWorldArm(c.base)) ||
    c.frameTween !== null
  );
};

export const selectClipActive = (state: RootState): boolean =>
  selectCameraIntent(state).clip !== null;
