import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { distanceMpc } from '../math/distanceMpc';

/**
 * sinSunAngularRadius — sine of the Sun's angular radius seen from `bodyPosMpc`,
 * the sphere-light width `pbrDirectSphere` takes. `sin(asin(x)) === x`, so this
 * is the ratio directly. The Mpc → m conversion lives here, as in
 * `sunVisibleFraction`, so the frame pass never spells the seam.
 */
export function sinSunAngularRadius(
  bodyPosMpc: Readonly<Vec3>,
  sunPosMpc: Readonly<Vec3>,
  sunRadiusM: number,
): number {
  const distanceM = distanceMpc(bodyPosMpc, sunPosMpc) * SCALE_UNITS.MPC_TO_M;
  return Math.min(1, sunRadiusM / distanceM);
}
