/** placeLabel — what a standing spot is called: an Earth place's name when one is near, else "55.67° N 12.52° E". */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { nearestEarthPlace } from './nearestEarthPlace';
import { latLonLabel } from '../geo/latLonLabel';
import { radToDeg } from '../math/radToDeg';

export function placeLabel(spot: SkySpot): { text: string; near: boolean } {
  const lonDeg = radToDeg(spot.lonRad);
  const latDeg = radToDeg(spot.latRad);
  const place = spot.body === 'earth' ? nearestEarthPlace(lonDeg, latDeg) : null;
  if (place !== null) return { text: place.names[0] ?? place.id, near: true };
  return { text: latLonLabel(lonDeg, latDeg), near: false };
}
