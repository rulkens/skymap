/**
 * Format a non-negative body radius, metres in, with adaptive units.
 * A seeded body's radius spans Earth (6.371e6 m) down to a moon-scale rock,
 * which a single km conversion renders as "0 km" — hence the m/cm/mm ladder.
 * The km branch keeps `toLocaleString()`, not `formatScalar`, so Earth still
 * reads "6,371 km".
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
