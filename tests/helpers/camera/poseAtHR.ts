/**
 * poseAtHR — a world-arm pose looking at `body`'s centre from altitude ratio
 * `hr` = distance/radius − 1. yaw 0.7 / pitch 0.3 is a shared off-nadir
 * standpoint so the eye isn't degenerately on-axis.
 */

import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';

export function poseAtHR(body: BodyState, radiusM: number, hr: number, roll = 0): CameraPose {
  return {
    target: [body.positionMpc[0]!, body.positionMpc[1]!, body.positionMpc[2]!],
    yaw: 0.7,
    pitch: 0.3,
    distance: radiusM * SCALE_UNITS.M_TO_MPC * (1 + hr),
    roll,
  };
}
