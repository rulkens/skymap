/**
 * baseGlobeFadeAlpha — Earth's base-globe draw visibility (0..1) as the
 * camera descends through `EARTH_BASE_GLOBE_FADE_*_ALTITUDE_KM`.
 *
 * Only meaningful once the detail-tile path is actually resident — the
 * caller (`earthLayer`) gates its use on a non-empty cut, since fading the
 * globe out with nothing covering the cap would punch a hole through to
 * whatever is behind it. Altitude, not the tile planner's resolved level,
 * drives the curve for the same reason `cloudDeckFade` uses altitude: it is
 * the physical fact that exists whether or not a tile has actually loaded.
 */

import { fadeBand } from '../math/fadeBand';
import { SCALE_UNITS } from '../../data/scaleUnits';
import {
  EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM,
  EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM,
} from '../../data/bodies/earthTileParams';

export function baseGlobeFadeAlpha(cameraDistanceMpc: number, radiusMpc: number): number {
  const altitudeKm = (cameraDistanceMpc - radiusMpc) / SCALE_UNITS.KM_TO_MPC;
  return fadeBand(
    {
      fullAt: EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM,
      goneAt: EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM,
    },
    altitudeKm,
  );
}
