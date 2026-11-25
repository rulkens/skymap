/**
 * trackKmToMpc — track km positions as Mpc in f64, still relative to the track's
 * own centre. The centre's world position joins per frame, at draw.
 */

import { SCALE_UNITS } from '../../data/scaleUnits';

export function trackKmToMpc(posKm: Float64Array): Float64Array {
  const out = new Float64Array(posKm.length);
  const k = SCALE_UNITS.KM_TO_MPC;
  for (let i = 0; i < posKm.length; i++) out[i] = posKm[i]! * k;
  return out;
}
