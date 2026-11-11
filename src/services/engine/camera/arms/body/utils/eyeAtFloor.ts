import type { BodyFixedPose } from '../../../../../../@types/camera/pose/BodyFixedPose';
import type { GroundRadiusLookup } from '../../../../../../@types/camera/terrain/GroundRadiusLookup';
import { bodyFixedEyeM } from '../../../../../../utils/camera/surfaceFrame/bodyFixedEyeM';
import { surfaceFloorM } from './surfaceFloorM';
import { FLOOR_PUSH_TOLERANCE_M } from '../data/floorPushToleranceM';

/** Whether the eye stands on `flooredBodyPose`'s descent floor, the ground under it asked live. */
export function eyeAtFloor(
  pose: BodyFixedPose,
  groundRadiusAtM: GroundRadiusLookup,
  standoffRadii: number,
): boolean {
  const eyeM = bodyFixedEyeM(pose);
  const floorM = surfaceFloorM(groundRadiusAtM(eyeM), standoffRadii);
  return Math.hypot(...eyeM) - floorM <= FLOOR_PUSH_TOLERANCE_M;
}
