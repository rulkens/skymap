/**
 * trackKmToWorldMpc — Sun-centred km positions as world Mpc, in f64. The Sun's
 * own world position joins AFTER the km→Mpc scaling, as `deriveBodyStates` does,
 * so a craft's trail vertex and its mesh position round identically.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';

export function trackKmToWorldMpc(posKm: Float64Array, sunMpc: Readonly<Vec3>): Float64Array {
  const out = new Float64Array(posKm.length);
  const k = SCALE_UNITS.KM_TO_MPC;
  for (let i = 0; i < posKm.length; i += 3) {
    out[i] = sunMpc[0] + posKm[i]! * k;
    out[i + 1] = sunMpc[1] + posKm[i + 1]! * k;
    out[i + 2] = sunMpc[2] + posKm[i + 2]! * k;
  }
  return out;
}
