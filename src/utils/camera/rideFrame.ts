/**
 * rideFrame — the ride camera's geometry before the visitor's offsets: aim at the midpoint of
 * craft and target, look along the encounter normal, stand back far enough that the pair fits.
 * The floor of 3 x closestKm keeps a tight flyby from putting the camera inside the target.
 */

import type { CameraRide } from '../../@types/camera/CameraRide';
import type { RideFrame } from '../../@types/camera/RideFrame';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { RIDE_FRAME_MARGIN } from '../../data/exhibits/ride/rideFrameMargin';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';
import { sphereFitDistance } from './sphereFitDistance';

export function rideFrame(
  ride: CameraRide,
  craftMpc: Readonly<Vec3>,
  targetMpc: Readonly<Vec3>,
  fovYRad: number,
  aspect: number,
  poseBasis: Readonly<Mat3>,
): RideFrame {
  const aim: Vec3 = [
    (craftMpc[0] + targetMpc[0]) / 2,
    (craftMpc[1] + targetMpc[1]) / 2,
    (craftMpc[2] + targetMpc[2]) / 2,
  ];
  const sepMpc = Math.hypot(
    craftMpc[0] - targetMpc[0],
    craftMpc[1] - targetMpc[1],
    craftMpc[2] - targetMpc[2],
  );
  const distance = Math.max(
    sphereFitDistance((sepMpc / 2) * RIDE_FRAME_MARGIN, fovYRad, aspect),
    3 * ride.closestKm * SCALE_UNITS.KM_TO_MPC,
  );
  // The orbit camera's own up, so the visitor's yaw turns about screen-up; its sideways axis
  // stands in where the normal runs along up and the cross degenerates.
  const camUp: Vec3 = [poseBasis[3], poseBasis[4], poseBasis[5]];
  const camSide: Vec3 = [poseBasis[0], poseBasis[1], poseBasis[2]];
  const helper = Math.abs(dot3(ride.normal, camUp)) < 0.99 ? camUp : camSide;
  const right = normalize3(cross3(ride.normal, helper));
  const up = cross3(right, ride.normal);
  return { aim, normal: ride.normal, right, up, distance };
}
