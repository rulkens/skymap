/**
 * zoomSourceCamera — the camera a zoom tick measures itself against: the one on
 * SCREEN, never a second logical camera the user can't see.
 *
 * Mid-gesture that is the drag register (`state.cam`) with the pivot-pin
 * applied — the register is what `orbitDrag` renders, updated synchronously by
 * every event so ticks arriving between frames compound correctly, and the pin
 * is what makes its `target` agree with the rendered one (the pin re-centres on
 * the live body every frame and never writes back into the register). At rest
 * the rendered pose is `lastPose`, already pinned; it only refreshes per frame,
 * so a burst of ticks inside one frame all measure from the same eye.
 */

import { poseOf } from './poseOf';
import { applyFocusedBodyPivot } from './applyFocusedBodyPivot';
import { assembleOrbitCamera } from './assembleOrbitCamera';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

export function zoomSourceCamera(
  state: EngineState,
  dragging: boolean,
  focusRow: SelectionRow | null,
  simDays: number,
): OrbitCamera | null {
  const register = state.cam;
  if (register === null) return null;
  const pose = dragging
    ? applyFocusedBodyPivot(
        poseOf(register),
        true,
        focusRow,
        simDays,
        state.cameraRuntime.clock.followPanOffset,
      )
    : state.cameraRuntime.lastPose.current;
  // The register's bases are refreshed by `runFrame` every frame and carry the
  // surface-follow correction, which `ORIENTATION_FRAMES[orientation]` (the
  // pre-bootstrap fallback) does not.
  const steady = ORIENTATION_FRAMES[state.settings.orientation];
  return assembleOrbitCamera(
    pose,
    state.cameraRuntime.projection,
    register.poseBasis ?? steady,
    register.upBasis ?? steady,
  );
}
