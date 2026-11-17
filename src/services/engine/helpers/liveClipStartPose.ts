/** The pose a `'live'`-start clip opens from: the displayed world pose, with
 * the DRAWN lens as `fov` so a `fov` track starts from what is on screen (a
 * driven lens included), not from the committed one. */

import type { CameraPose } from '../../../@types/camera/pose/CameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { liveWorldPose } from './liveWorldPose';

export function liveClipStartPose(state: EngineState): CameraPose {
  return { ...liveWorldPose(state), fov: state.cameraRuntime.outputs.projection.fovYRad };
}
