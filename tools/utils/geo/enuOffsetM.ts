/**
 * enuOffsetM — east/north metres of `to` from `from` on the local tangent
 * plane at `from`, equirectangular small-angle (matches
 * `lonLatBoundsToEnuM.ts`'s formula and IUGG mean radius: over a few hundred
 * metres the two agree with a proper ellipsoidal tangent plane to ~1 cm).
 */

import type { Vec2 } from '../../../src/@types/math/Vec2';

const DEG_TO_RAD = Math.PI / 180;

export function enuOffsetM(
  from: { readonly latDeg: number; readonly lonDeg: number },
  to: { readonly latDeg: number; readonly lonDeg: number },
  radiusM: number,
): Vec2 {
  const metresPerDegLat = DEG_TO_RAD * radiusM;
  const metresPerDegLon = metresPerDegLat * Math.cos(from.latDeg * DEG_TO_RAD);
  return [(to.lonDeg - from.lonDeg) * metresPerDegLon, (to.latDeg - from.latDeg) * metresPerDegLat];
}
