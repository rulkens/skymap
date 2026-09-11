/**
 * displayedEye — the world-space eye of the DISPLAYED (on-screen) pose, the
 * standpoint every frame-sim fixture measures altitude and tilt from. Fixed
 * to the default orientation frame, matching every fixture this harness
 * replaces (none of them exercise a non-default orientation).
 */

import { liveWorldPose } from '../../../src/services/engine/helpers/liveWorldPose';
import { eyeMpcOf } from '../../../src/utils/camera/eyeMpcOf';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];

export function displayedEye(state: EngineState): Vec3 {
  return eyeMpcOf(liveWorldPose(state), B);
}
