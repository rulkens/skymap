import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import { skySpotRadial } from '../geo/skySpotRadial';

/** How far a body-fixed point lies from the spot's radial line, metres: the ground offset at its height. */
export function offSpotM(pointLocalM: Readonly<Vec3>, spot: SkySpot): number {
  const up = skySpotRadial(spot);
  const r = Math.hypot(pointLocalM[0], pointLocalM[1], pointLocalM[2]);
  return Math.hypot(
    pointLocalM[0] - up[0] * r,
    pointLocalM[1] - up[1] * r,
    pointLocalM[2] - up[2] * r,
  );
}
