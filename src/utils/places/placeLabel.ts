/** placeLabel — what a standing spot is called: an Earth place's name when one is near, else "55.67° N 12.52° E". */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { nearestEarthPlace } from './nearestEarthPlace';
import type { PlaceLabel } from '../../@types/geo/PlaceLabel';
import { spotLatLonLabel } from './spotLatLonLabel';
import { radToDeg } from '../math/radToDeg';

export function placeLabel(spot: SkySpot): PlaceLabel {
  const place =
    spot.body === 'earth' ? nearestEarthPlace(radToDeg(spot.lonRad), radToDeg(spot.latRad)) : null;
  if (place !== null) return { text: place.names[0] ?? place.id, near: true };
  return { text: spotLatLonLabel(spot), near: false };
}
