/**
 * liveWorldPose — the world arm of the DISPLAYED pose (`displayedPose`, the
 * pose the last frame drew, tilt projection included); the one on-screen
 * resolution site, so no reader invents a second. Authored-side reads (the
 * gesture folds) go through `authoredWorldPose` instead — feeding a projected
 * pose back into an authoring path re-creates the R12b-1 register walk.
 *
 * It always reads `lastRenderedSimDays`: between frames (pick, demand,
 * `getLivePose`) that is the epoch the last frame DREW at — what welds those
 * reads to the pixels on screen.
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { resolveWorldArm } from '../camera/poseFrameConversion';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function liveWorldPose(state: EngineState): CameraPose {
  return resolveWorldArm(
    state.cameraRuntime.displayedPose.current,
    // `deriveBodyStates` keys on the raw id string; the body arm's `BodyId` is
    // the same key narrowed (the `id as BodyId` convention `regimeArmFor` and
    // `slabs.ts` already use at this boundary).
    deriveBodyStates(state.cameraRuntime.lastRenderedSimDays.current) as ReadonlyMap<
      BodyId,
      BodyState
    >,
    // The committed pose basis (the decode never mid-slerps) and the live
    // up-basis — the same split `runFrame` feeds the draw path.
    ORIENTATION_FRAMES[state.settings.orientation],
    state.cameraRuntime.upBasis.current,
  );
}
