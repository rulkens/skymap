import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * directionToLonLatDeg — geodetic longitude/latitude (degrees) of a unit
 * direction in a body's LOCAL frame. Exact inverse of
 * `equirectUvToDirection`'s `x = cosLat·cos(lon), y = cosLat·sin(lon),
 * z = sin(lat)` (east-positive longitude, local-Z the polar axis) — the same
 * convention `planEarthTiles`'s `subUv` and `derivePlannerParams`'s band uv
 * both encode. Confirmed consistent, not assumed: `TEXTURE_PRIME_MERIDIAN_U`
 * is exactly 0.5, which cancels planEarthTiles's `atan2(...)/(2π) + 0.5`
 * down to the same `lon/(2π) + 0.5` the bands use.
 */
export function directionToLonLatDeg(dirLocal: Readonly<Vec3>): LonLatDeg {
  return {
    lonDeg: (Math.atan2(dirLocal[1], dirLocal[0]) * 180) / Math.PI,
    latDeg: (Math.asin(Math.min(1, Math.max(-1, dirLocal[2]))) * 180) / Math.PI,
  };
}
