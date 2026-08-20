import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * lonLatDegToDirection — the unit direction in a body's LOCAL frame for a
 * geodetic longitude/latitude (degrees). Exact inverse of
 * `directionToLonLatDeg`: reproduces its documented forward convention
 * `x = cosLat·cos(lon), y = cosLat·sin(lon), z = sin(lat)` rather than
 * re-deriving it independently, so the two stay byte-consistent by
 * construction.
 */
export function lonLatDegToDirection(point: LonLatDeg): Vec3 {
  const lonRad = (point.lonDeg * Math.PI) / 180;
  const latRad = (point.latDeg * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  return [cosLat * Math.cos(lonRad), cosLat * Math.sin(lonRad), Math.sin(latRad)];
}
