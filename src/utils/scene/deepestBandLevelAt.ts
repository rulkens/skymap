import type { EarthTileBand } from '../../@types/scene/EarthTileBand';
import type { LonLatDeg } from '../../@types/scene/LonLatDeg';

/**
 * deepestBandLevelAt — the deepest level any manifest band bakes at a
 * geodetic point, or `null` if no band covers it (only the whole-globe base
 * is available there). Converts degrees to uv with the same formula
 * `derivePlannerParams` used to build the bands (`u=(lon+180)/360`,
 * `v=(lat+90)/180`) rather than inverting `uBounds`/`vBounds` back to degrees.
 */
export function deepestBandLevelAt(
  bands: readonly EarthTileBand[],
  point: LonLatDeg,
): number | null {
  const u = point.lonDeg / 360 + 0.5;
  const v = point.latDeg / 180 + 0.5;
  let deepest: number | null = null;
  for (const band of bands) {
    if (u < band.uBounds[0] || u > band.uBounds[1]) continue;
    if (v < band.vBounds[0] || v > band.vBounds[1]) continue;
    if (deepest === null || band.max > deepest) deepest = band.max;
  }
  return deepest;
}
