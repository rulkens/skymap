/**
 * framedLensRad — the lens a search while standing turns to (spec §7): a sized target fills
 * `SKY_FRAMED_DIAMETERS` of its angular diameter down to `SKY_SEARCH_LENS_MIN_RAD`, a star halves
 * the lens (D4); neither ever widens the view the person already chose.
 */

import { SKY_FRAMED_DIAMETERS } from '../../data/sky/skyFramedDiameters';
import { SKY_SEARCH_LENS_MIN_RAD } from '../../data/sky/skySearchLensMinRad';
import { SKY_STAR_LENS_MIN_RAD } from '../../data/sky/skyStarLensMinRad';

export function framedLensRad(
  radiusMpc: number,
  distanceMpc: number,
  currentLensRad: number,
  isStar: boolean,
): number {
  const wanted = isStar
    ? Math.max(SKY_STAR_LENS_MIN_RAD, currentLensRad / 2)
    : Math.max(SKY_SEARCH_LENS_MIN_RAD, SKY_FRAMED_DIAMETERS * 2 * Math.atan(radiusMpc / distanceMpc));
  return Math.min(currentLensRad, wanted);
}
