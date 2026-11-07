/**
 * framedLensRad — the lens a search while standing turns to (spec §7): a sized target fills
 * `SKY_FRAMED_DIAMETERS` of its angular diameter, a star halves the lens (D4); neither ever
 * widens the view the person already chose.
 */

import { LENS_MIN_DEG } from '../../data/camera/lensMinDeg';
import { SKY_FRAMED_DIAMETERS } from '../../data/sky/skyFramedDiameters';
import { SKY_STAR_LENS_MIN_RAD } from '../../data/sky/skyStarLensMinRad';
import { degToRad } from '../math/degToRad';

const LENS_MIN_RAD = degToRad(LENS_MIN_DEG);

export function framedLensRad(
  radiusMpc: number,
  distanceMpc: number,
  currentLensRad: number,
  isStar: boolean,
): number {
  const wanted = isStar
    ? Math.max(SKY_STAR_LENS_MIN_RAD, currentLensRad / 2)
    : Math.max(LENS_MIN_RAD, SKY_FRAMED_DIAMETERS * 2 * Math.atan(radiusMpc / distanceMpc));
  return Math.min(currentLensRad, wanted);
}
