import type { CameraPose } from '../../@types/camera/CameraPose';
import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { lonLatDegToDirection } from '../scene/lonLatDegToDirection';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { orbitAnglesLookingAlong } from './orbitAnglesLookingAlong';

/**
 * lonLatFocusPose — the CameraPose that puts a body's given geodetic point
 * exactly under the camera (sub-camera point = `point`), at `distance`, with
 * the target at the body's centre.
 *
 * The exact inverse of the sub-camera readout `earthTileSubsystem.getDebugSnapshot`
 * computes: that reads `dirLocal = bodyOrientationᵀ · normalize(camPos − bodyPos)`
 * then `directionToLonLatDeg(dirLocal)`. Here we go the other way —
 * `lonLatDegToDirection` → rotate by `bodyOrientation` (untransposed, local→world)
 * to get the world direction from the body centre toward the camera — then hand
 * that to `orbitAnglesLookingAlong` (the aim is the opposite direction, back
 * toward the body) to recover the (yaw, pitch) the SAME `frameBasis` decodes
 * back to that exact world direction.
 */
export function lonLatFocusPose(
  point: LonLatDeg,
  targetMpc: Readonly<Vec3>,
  distance: number,
  bodyOrientation: Readonly<Mat3>,
  frameBasis: Mat3,
): CameraPose {
  const dirLocal = lonLatDegToDirection(point);
  // local→world: bodyOrientation's columns are the body-local axes in world
  // space (the same convention camPosLocal's header derives its transpose
  // from), so the untransposed product carries a local direction OUT to world.
  const dirWorld = rotateVec3ByTightMat3(dirLocal, bodyOrientation);
  // orbitAnglesLookingAlong wants the AIM (camera → target); the eye sits on
  // the OPPOSITE side of the target from the sub-camera point, so the aim is
  // the negated direction-toward-camera.
  const forward: Vec3 = [-dirWorld[0], -dirWorld[1], -dirWorld[2]];
  const { yaw, pitch } = orbitAnglesLookingAlong(forward, frameBasis);
  return { target: [targetMpc[0], targetMpc[1], targetMpc[2]], yaw, pitch, distance };
}
