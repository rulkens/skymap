/**
 * liveRenderCamera — the OrbitCamera actually drawn last frame, for debug tooling
 * that runs OUTSIDE the frame loop. `runFrame` stores only the orbit params it
 * drew, so this re-runs the same `assembleOrbitCamera` merge the frame path uses
 * rather than handing back the stale `state.cam` boot camera.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { liveWorldPose } from './liveWorldPose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function liveRenderCamera(state: EngineState): OrbitCamera | null {
  if (!state.cam) return null;
  return assembleOrbitCamera(
    liveWorldPose(state),
    state.cameraRuntime.outputs.projection,
    ORIENTATION_FRAMES[state.settings.orientation],
    state.cameraRuntime.outputs.upBasis,
  );
}
