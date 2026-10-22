import { cartesianToRaDec } from '../math/cartesianToRaDec';
import { angularSepSqArcsec } from '../math/angularSepSqArcsec';
import {
  POSITION_MATCH_MAX_ARCSEC,
  POSITION_MATCH_MAX_DIST_DELTA_MPC,
} from '../../data/galaxyCatalog/positionMatchTolerance';

const MAX_SQ_ARCSEC = POSITION_MATCH_MAX_ARCSEC ** 2;

/**
 * The row nearest the direction (raDeg, decDeg) within 30″, or -1. With a
 * distance, only rows within 0.05 Mpc of it compete, so two galaxies on one
 * line of sight resolve apart; `null` keeps the direction-only search legacy
 * two-part `pos@` ids decode with. Ties go to the lower row.
 */
export function nearestRowByDirection(
  positions: Float32Array,
  count: number,
  raDeg: number,
  decDeg: number,
  distMpc: number | null,
): number {
  const cosDecT = Math.cos((decDeg * Math.PI) / 180);
  let bestSqArcsec = Infinity;
  let bestRow = -1;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3 + 0]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    if (
      distMpc !== null &&
      Math.abs(Math.hypot(x, y, z) - distMpc) > POSITION_MATCH_MAX_DIST_DELTA_MPC
    )
      continue;
    const [ra, dec] = cartesianToRaDec(x, y, z);
    const sqArcsec = angularSepSqArcsec(ra, dec, raDeg, decDeg, cosDecT);
    if (sqArcsec < bestSqArcsec) {
      bestSqArcsec = sqArcsec;
      bestRow = i;
    }
  }
  return bestSqArcsec <= MAX_SQ_ARCSEC ? bestRow : -1;
}
