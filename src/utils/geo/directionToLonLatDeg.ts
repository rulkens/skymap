import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * directionToLonLatDeg — geodetic longitude/latitude (degrees) of any non-zero
 * vector in a body's LOCAL frame. Exact inverse of `equirectUvToDirection`'s
 * `x = cosLat·cos(lon), y = cosLat·sin(lon), z = sin(lat)` (east-positive
 * longitude, local-Z the polar axis) — the same convention `cutSurfaceTiles`
 * (via `equirectUvToDirection`) and `derivePlannerParams`'s band uv both
 * encode. `TEXTURE_PRIME_MERIDIAN_U` is exactly 0.5, which cancels
 * `dirToEquirectUv`'s `atan2(...)/(2π) + 0.5` down to the bands' own
 * `lon/(2π) + 0.5`.
 */
export function directionToLonLatDeg(dirLocal: Readonly<Vec3>): LonLatDeg {
  const [x, y, z] = dirLocal;
  // Normalised here, not assumed: callers pass eye POSITIONS in metres as well
  // as unit directions, and `asin` clamped every one of those to a pole — which
  // reads as "covered by the whole-globe band only" and pinned the CPU height
  // lookup to the base level. `atan2` is scale-free, so only `z` needs it.
  const mag = Math.hypot(x, y, z);
  // A zero or non-finite vector has no lon/lat. It must still answer a NUMBER:
  // `deepestBandLevelAt` rejects a point with `u < lo || u > hi`, and both are
  // false for NaN, so a NaN would land inside every band instead of none.
  if (!Number.isFinite(mag) || mag === 0) return { lonDeg: 0, latDeg: 0 };
  return {
    lonDeg: (Math.atan2(y, x) * 180) / Math.PI,
    latDeg: (Math.asin(Math.min(1, Math.max(-1, z / mag))) * 180) / Math.PI,
  };
}
