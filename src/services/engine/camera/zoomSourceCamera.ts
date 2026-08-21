/**
 * zoomSourceCamera — the camera a zoom tick measures itself against: the one
 * the tick's own result will land on, never a second one the user can't see.
 *
 * Mid-gesture that is the drag register (`state.cam`) with the pivot-pin
 * applied — the register is what `orbitDrag` renders, updated synchronously by
 * every event so ticks arriving between frames compound correctly, and the pin
 * is what makes its `target` agree with the rendered one (the pin re-centres on
 * the live body every frame and never writes back into the register). At rest
 * the rendered pose is `lastPose`, already pinned; it only refreshes per frame,
 * so a burst of ticks inside one frame all measure from the same eye.
 *
 * The one place the tick's destination is NOT what is on screen: while the
 * follow driver's ease target owns the distance, the tick scales that target,
 * so the target — not the eased distance still on its way there — is what the
 * step has to be floored against and proportioned to. At rest after the ease
 * saturates the two are the same number, so this is a no-op outside the
 * ~600 ms window right after a focus.
 */

import { poseOf } from './poseOf';
import { applyFocusedBodyPivot } from './applyFocusedBodyPivot';
import { assembleOrbitCamera } from './assembleOrbitCamera';
import { followOwnsDistance } from './followOwnsDistance';
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
  const { clock, lastPose, prevActiveId } = state.cameraRuntime;
  const rendered = dragging
    ? applyFocusedBodyPivot(poseOf(register), true, focusRow, simDays, clock.followPanOffset)
    : lastPose.current;
  const pose =
    !dragging && followOwnsDistance(clock, prevActiveId.current)
      ? { ...rendered, distance: clock.followDistanceTarget! }
      : rendered;
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
