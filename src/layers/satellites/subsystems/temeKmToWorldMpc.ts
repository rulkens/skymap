import { SCALE_UNITS } from '../../../data/scaleUnits';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';

/** TEME km → world Mpc about `base`. km become Mpc BEFORE `base` (Earth's au-scale heliocentric
 * position) is added, or the offset would round off an au magnitude. */
export function temeKmToWorldMpc(
  m: Readonly<Mat3>,
  [x, y, z]: Readonly<Vec3>,
  base: Readonly<Vec3>,
): Vec3 {
  return [
    base[0] + (m[0] * x + m[3] * y + m[6] * z) * SCALE_UNITS.KM_TO_MPC,
    base[1] + (m[1] * x + m[4] * y + m[7] * z) * SCALE_UNITS.KM_TO_MPC,
    base[2] + (m[2] * x + m[5] * y + m[8] * z) * SCALE_UNITS.KM_TO_MPC,
  ];
}
