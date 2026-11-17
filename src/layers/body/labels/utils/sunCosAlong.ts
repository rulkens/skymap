/**
 * sunCosAlong — the Sun's cosine at the ground `km` east (negative: west) of a point
 * along its parallel: where the far end of a name lands. The cosine floor keeps the
 * step finite near a pole.
 */

import type { AntiqueBodyView } from '../@types/AntiqueBodyView';
import { degToRad } from '../../../../utils/math/degToRad';

export function sunCosAlong(
  view: AntiqueBodyView,
  latDeg: number,
  lonDeg: number,
  km: number,
): number {
  const dLonDeg =
    ((km / view.radiusKm) * (180 / Math.PI)) / Math.max(Math.cos(degToRad(latDeg)), 0.1);
  return view.sunCos(latDeg, lonDeg + dLonDeg);
}
