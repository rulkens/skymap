/**
 * authoredWorldPose — the world arm of the AUTHORED register (`lastPose`,
 * pre-projection). The gesture folds MUST read this, never `liveWorldPose`:
 * folding drag deltas over the displayed (tilted) pose and re-committing it
 * through the pivot pin is the R12b-1 loop that walked the eye 8,519 km per
 * frame. The projection re-derives the on-screen image from this pose, so
 * authoring against it changes nothing the user sees except the drag's
 * mapping composing below the tilt (disclosed feel change, round 12c).
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { resolveWorldArm } from '../camera/poseFrameConversion';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function authoredWorldPose(state: EngineState): CameraPose {
  return resolveWorldArm(
    state.cameraRuntime.lastPose.current,
    deriveBodyStates(state.cameraRuntime.lastRenderedSimDays.current) as ReadonlyMap<
      BodyId,
      BodyState
    >,
    ORIENTATION_FRAMES[state.settings.orientation],
    state.cameraRuntime.upBasis.current,
  );
}
