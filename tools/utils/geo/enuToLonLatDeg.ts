/** The inverse of `enuOffsetM`: the geodetic point `eastM`/`northM` away from
 *  `site`, same small-angle tangent-plane approximation, same radius. */

import { degToRad } from '../../../src/utils/math/degToRad';

export function enuToLonLatDeg(
  site: { readonly latDeg: number; readonly lonDeg: number },
  eastM: number,
  northM: number,
  radiusM: number,
): { latDeg: number; lonDeg: number } {
  const metresPerDegLat = degToRad(1) * radiusM;
  const metresPerDegLon = metresPerDegLat * Math.cos(degToRad(site.latDeg));
  return {
    latDeg: site.latDeg + northM / metresPerDegLat,
    lonDeg: site.lonDeg + eastM / metresPerDegLon,
  };
}
