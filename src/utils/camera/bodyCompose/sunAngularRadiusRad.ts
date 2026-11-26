import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import { SOLAR_RADIUS_KM } from '../../../data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../data/scaleUnits';

/** sunAngularRadiusRad — the Sun's disc radius seen from a body, the Sun at the render origin
 *  like `sunDirLocal`: 0.267° at Earth and the Moon, 0.175° at Mars. */
export function sunAngularRadiusRad(
  bodyPosMpc: Readonly<Vec3>,
  renderOriginMpc: Readonly<Vec3>,
): number {
  // A ratio of two lengths, so both stay in Mpc: no metre seam to cross (`oneMpcSeam.test.ts`).
  const distanceMpc = Math.hypot(
    bodyPosMpc[0] - renderOriginMpc[0],
    bodyPosMpc[1] - renderOriginMpc[1],
    bodyPosMpc[2] - renderOriginMpc[2],
  );
  return Math.asin(Math.min(1, (SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_MPC) / distanceMpc));
}
