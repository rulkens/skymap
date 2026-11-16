/** nearestEarthPlace — the closest `EARTH_PLACES` entry within 25 km (great circle), else null. */

import type { EarthPlace } from '../../@types/palette/EarthPlace';
import { EARTH_PLACES } from '../../data/palette/earthPlaces';
import { degToRad } from '../math/degToRad';

const EARTH_RADIUS_KM = 6371;
const NEAR_KM = 25;

export function nearestEarthPlace(lonDeg: number, latDeg: number): EarthPlace | null {
  const lat = degToRad(latDeg);
  let best: EarthPlace | null = null;
  let bestKm = NEAR_KM;
  for (const place of EARTH_PLACES) {
    const placeLat = degToRad(place.latDeg);
    const h =
      Math.sin((placeLat - lat) / 2) ** 2 +
      Math.cos(lat) * Math.cos(placeLat) * Math.sin(degToRad(place.lonDeg - lonDeg) / 2) ** 2;
    const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
    if (km <= bestKm) {
      best = place;
      bestKm = km;
    }
  }
  return best;
}
