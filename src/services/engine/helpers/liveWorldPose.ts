/** The world arm of the DISPLAYED pose (tilt projection included), the one
 * on-screen resolution site. Authoring paths must NOT read it — feeding a
 * projected pose back in re-creates the R12b-1 register walk; they resolve the
 * register themselves. Always at `outputs.simDays`: the epoch last frame DREW. */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { foldToWorld } from '../camera/rungs/foldToWorld';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { terrainHeightAtOf } from '../../../utils/surfaceTiles/terrainHeightAtOf';

export function liveWorldPose(state: EngineState): CameraPose {
  return foldToWorld(state.cameraRuntime.outputs.displayed, {
    bodies: deriveBodyStates(state.cameraRuntime.outputs.simDays) as ReadonlyMap<BodyId, BodyState>,
    // The committed pose basis (the decode never mid-slerps) and the live
    // up-basis — the same split `runFrame` feeds the draw path.
    poseBasis: ORIENTATION_FRAMES[state.settings.orientation],
    upBasis: state.cameraRuntime.outputs.upBasis,
    terrainHeightAt: terrainHeightAtOf(state.subsystems.surfaceTiles),
  });
}
