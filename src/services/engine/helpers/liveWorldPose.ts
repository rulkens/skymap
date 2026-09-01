/**
 * liveWorldPose — the world arm of `lastPose`; the one resolution site besides
 * `runFrame`'s own per-frame call, so no reader invents a second.
 *
 * It always reads `lastRenderedSimDays`, which means two things by call site.
 * Between frames (pick, demand, `getLivePose`, the gesture seed) that is the
 * epoch the last frame DREW at — what welds those reads to the pixels on screen.
 * Inside the produce step `runFrame` has already advanced it, so `followBody`'s
 * `from` capture gets THIS frame's epoch: the ease starts where the camera is now.
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
    state.cameraRuntime.lastPose.current,
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
