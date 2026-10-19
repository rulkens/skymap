/**
 * voyageEntryPose — the voyage camera's zero-offset pose at launch, for the entry fly-in: the eye
 * on the Sun (the launch point) looking along the line of flight, its target `VOYAGE_EYE_ARM_MPC`
 * ahead, as `voyagePose` places it while the trip has not begun.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { VoyageDestination } from '../../layers/voyage/@types/VoyageDestination';
import { VOYAGE_EYE_ARM_MPC } from '../../data/voyage/voyageEyeArmMpc';
import { orbitAnglesLookingAlong } from '../camera/orbitAnglesLookingAlong';
import { normalize3 } from '../math/normalize3';

export function voyageEntryPose(
  destination: VoyageDestination,
  poseBasis: Readonly<Mat3>,
): CameraPose {
  const dir = normalize3(destination.positionMpc);
  return {
    target: [dir[0] * VOYAGE_EYE_ARM_MPC, dir[1] * VOYAGE_EYE_ARM_MPC, dir[2] * VOYAGE_EYE_ARM_MPC],
    ...orbitAnglesLookingAlong(dir, poseBasis),
    distance: VOYAGE_EYE_ARM_MPC,
  };
}
