/** spotLatLonLabel — a standing spot as "55.67° N 12.52° E". */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { latLonLabel } from '../geo/latLonLabel';
import { radToDeg } from '../math/radToDeg';

export function spotLatLonLabel(spot: SkySpot): string {
  return latLonLabel(radToDeg(spot.lonRad), radToDeg(spot.latRad));
}
