/**
 * liveRenderCamera — the OrbitCamera actually drawn last frame, for debug
 * tooling that runs OUTSIDE the frame loop (the `l` hotkey).
 *
 * `runFrame` never stores a full assembled camera on `EngineState` — only the
 * orbit params it produced (`cameraRuntime.lastPose`, pivot-corrected) plus
 * the projection and orientation bases it refreshes every frame. This re-runs
 * the same `assembleOrbitCamera` merge `runFrame`/`deriveFrameContext` use, so
 * a caller off the frame gets the identical camera, not the stale
 * `state.cam` drag register (see `frameContext.ts`'s header).
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
    state.cameraRuntime.projection,
    ORIENTATION_FRAMES[state.settings.orientation],
    state.cameraRuntime.upBasis.current,
  );
}
