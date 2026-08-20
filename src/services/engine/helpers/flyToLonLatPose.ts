/**
 * flyToLonLatPose — the CameraPose that snaps the sub-camera point to exactly
 * `(lonDeg, latDeg)` on Earth, at the CURRENT altitude, target re-centred on
 * Earth. Backs the Earth Tile Atlas debug panel's fly-to-coordinates instrument.
 *
 * `lonLatFocusPose` is the exact inverse of the sub-camera readout
 * (`earthTileSubsystem.getDebugSnapshot`'s `subCamera`), so a value typed here
 * and the value the readout reports back should agree.
 *
 * Reads `distance` from `cameraRuntime.lastPose.current` — the live produced
 * pose, not `state.cam` (refreshed only at boot + drag start — see
 * `liveRenderCamera`'s header) — so the instrument preserves the CURRENT
 * altitude rather than a stale one.
 *
 * Callers commit the result through `commitCameraPose` — the same INSTANT
 * (non-tweened) write bootstrap and orbit-controls pointerup use to bake a
 * resting pose into `camera.base` — rather than a tween, because the brief is
 * a snap, not a fly. This composes cleanly with the follow driver: `followBody`
 * only wins while idle and re-centres `target` on Earth's LIVE position every
 * frame regardless of what `base.target` holds, and its yaw/pitch ease is
 * already saturated (t=1) whenever Earth has been focused for more than one
 * focus-tween duration — the overwhelmingly common case while poking at this
 * panel — so the committed yaw/pitch/distance take effect on the very next
 * frame with no fight and no visible re-approach.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import { lonLatFocusPose } from '../../../utils/camera/lonLatFocusPose';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function flyToLonLatPose(
  state: EngineState,
  lonDeg: number,
  latDeg: number,
): CameraPose | null {
  const earth = state.data.bodies.earth;
  if (earth === null) return null;
  const simDays = state.cameraRuntime.lastRenderedSimDays.current;
  const earthState = deriveBodyStates(simDays).get(earth.id);
  if (earthState === undefined) return null;
  const distance = state.cameraRuntime.lastPose.current.distance;
  const frameBasis = ORIENTATION_FRAMES[state.settings.orientation];
  return lonLatFocusPose(
    { lonDeg, latDeg },
    earthState.positionMpc,
    distance,
    earthState.orientation,
    frameBasis,
  );
}
