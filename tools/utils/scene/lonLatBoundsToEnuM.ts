import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import type { EnuBoundsM } from './EnuBoundsM';

/** IUGG mean Earth radius, metres — the sphere PROJ's `+proj=topocentric`
 *  ellipsoid agrees with to well under a metre over a few kilometres. */
const EARTH_RADIUS_M = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;

/**
 * lonLatBoundsToEnuM — a geographic box in the ENU metre frame of an anchor
 * at `originLatDeg`/`originLonDeg`.
 *
 * Equirectangular small-angle, not a PROJ pipeline: over a box of a few km the
 * two agree to well under a metre, and spawning `cct` for four corners would
 * put PROJ on the critical path of callers that otherwise need none.
 * `headingDeg` is ignored, matching `topocentricPositionsM` and the LiDAR
 * pipeline — the frames must agree, and those two define it.
 */
export function lonLatBoundsToEnuM(
  bounds: LonLatBounds,
  originLatDeg: number,
  originLonDeg: number,
): EnuBoundsM {
  const metresPerDegLat = DEG_TO_RAD * EARTH_RADIUS_M;
  const metresPerDegLon = metresPerDegLat * Math.cos(originLatDeg * DEG_TO_RAD);
  return {
    minXM: (bounds.west - originLonDeg) * metresPerDegLon,
    maxXM: (bounds.east - originLonDeg) * metresPerDegLon,
    minYM: (bounds.south - originLatDeg) * metresPerDegLat,
    maxYM: (bounds.north - originLatDeg) * metresPerDegLat,
  };
}
