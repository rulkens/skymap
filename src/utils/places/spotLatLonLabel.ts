/** spotLatLonLabel — a standing spot as "55.67° N 12.52° E", latitude first, the way a person reads it. */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { radToDeg } from '../math/radToDeg';

export function spotLatLonLabel(spot: SkySpot): string {
  const latDeg = radToDeg(spot.latRad);
  const lonDeg = radToDeg(spot.lonRad);
  const lat = `${Math.abs(latDeg).toFixed(2)}° ${latDeg < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(lonDeg).toFixed(2)}° ${lonDeg < 0 ? 'W' : 'E'}`;
  return `${lat} ${lon}`;
}
