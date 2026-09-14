/**
 * tiltOverBody — angle between the DISPLAYED view axis and `body`'s nadir
 * (0 = looking straight down, π/2 = the horizon). The pure measurement every
 * tilt-mapping fixture pins its assertions on.
 */

import { displayedEye } from './displayedEye';
import { tiltOfPose } from './tiltOfPose';
import { liveWorldPose } from '../../../src/services/engine/helpers/liveWorldPose';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';

export function tiltOverBody(state: EngineState, body: BodyState): number {
  return tiltOfPose(liveWorldPose(state), displayedEye(state), body);
}
