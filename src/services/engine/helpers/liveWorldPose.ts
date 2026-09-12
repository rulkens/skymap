/** The world arm of the DISPLAYED pose (tilt projection included), the one
 * on-screen resolution site. Authoring paths must NOT read it — feeding a
 * projected pose back in re-creates the R12b-1 register walk; they resolve the
 * register themselves. Always at `outputs.simDays`: the epoch last frame DREW. */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { resolveWorldArm } from '../camera/poseFrameConversion';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function liveWorldPose(state: EngineState): CameraPose {
  return resolveWorldArm(
    state.cameraRuntime.outputs.displayed,
    deriveBodyStates(state.cameraRuntime.outputs.simDays) as ReadonlyMap<BodyId, BodyState>,
    // The committed pose basis (the decode never mid-slerps) and the live
    // up-basis — the same split `runFrame` feeds the draw path.
    ORIENTATION_FRAMES[state.settings.orientation],
    state.cameraRuntime.outputs.upBasis,
  );
}
