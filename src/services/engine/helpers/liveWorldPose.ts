/**
 * liveWorldPose — the world arm of the last produced pose, for callers OUTSIDE
 * the frame loop (pick, demand, the gesture seed, `getLivePose`, the follow
 * driver's `from` capture). `runFrame` resolves its own arm once per frame;
 * this is the single OFF-frame resolution site, so no reader invents a second.
 *
 * Resolved at `lastRenderedSimDays` — the epoch the last frame DREW its bodies
 * at, not a fresh clock sample — so an off-frame read stays welded to the pixels
 * on screen (the pick-path rule on `CameraRuntime.d.ts`'s `lastRenderedSimDays`).
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
