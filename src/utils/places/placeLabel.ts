/** placeLabel — what a standing spot is called: an Earth place's name when one is near, else "55.67° N 12.52° E". */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { nearestEarthPlace } from './nearestEarthPlace';

const DEG_PER_RAD = 180 / Math.PI;

export function placeLabel(spot: SkySpot): { text: string; near: boolean } {
  const lonDeg = spot.lonRad * DEG_PER_RAD;
  const latDeg = spot.latRad * DEG_PER_RAD;
  const place = spot.body === 'earth' ? nearestEarthPlace(lonDeg, latDeg) : null;
  if (place !== null) return { text: place.names[0] ?? place.id, near: true };
  const lat = `${Math.abs(latDeg).toFixed(2)}° ${latDeg < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(lonDeg).toFixed(2)}° ${lonDeg < 0 ? 'W' : 'E'}`;
  return { text: `${lat} ${lon}`, near: false };
}
