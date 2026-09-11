/**
 * Format a body radius given in metres with adaptive units.
 *
 * BodyInfo.radiusM spans planets (Earth: 6.371e6 m) down to hand-authored
 * mesh bodies sized at ordinary human scale (a few metres or less) — a
 * single km conversion reads as "0 km" for those, so the unit steps down
 * through m/cm/mm to stay legible at every scale, mirroring the ladder
 * `formatDistance` walks for camera distance.
 *
 * The km branch keeps `toLocaleString()` on the km value (no `formatScalar`)
 * so today's planetary output — "6,371 km" for Earth — is unchanged.
 *
 * @param radiusM  Radius in metres. Must be non-negative.
 */

import { SCALE_UNITS } from '../../data/scaleUnits';
import { formatScalar } from './formatScalar';

export function formatRadiusM(radiusM: number): string {
  if (radiusM >= SCALE_UNITS.KM_TO_M) {
    return `${(radiusM * SCALE_UNITS.M_TO_KM).toLocaleString()} km`;
  }
  if (radiusM >= 1) {
    return `${formatScalar(radiusM)} m`;
  }
  if (radiusM >= 0.01) {
    return `${formatScalar(radiusM * 100)} cm`;
  }
  return `${formatScalar(radiusM * 1000)} mm`;
}
