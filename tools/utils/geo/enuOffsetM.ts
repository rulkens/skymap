/**
 * enuOffsetM — east/north metres of `to` from `from` on the local tangent
 * plane at `from`, equirectangular small-angle (matches
 * `lonLatBoundsToEnuM.ts`'s formula and IUGG mean radius: over a few hundred
 * metres the two agree with a proper ellipsoidal tangent plane to ~1 cm).
 */

import type { Vec2 } from '../../../src/@types/math/Vec2';
import { degToRad } from '../../../src/utils/math/degToRad';

export function enuOffsetM(
  from: { readonly latDeg: number; readonly lonDeg: number },
  to: { readonly latDeg: number; readonly lonDeg: number },
  radiusM: number,
): Vec2 {
  const metresPerDegLat = degToRad(1) * radiusM;
  const metresPerDegLon = metresPerDegLat * Math.cos(degToRad(from.latDeg));
  return [(to.lonDeg - from.lonDeg) * metresPerDegLon, (to.latDeg - from.latDeg) * metresPerDegLat];
}
