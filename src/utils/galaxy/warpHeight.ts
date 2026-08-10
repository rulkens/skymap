/**
 * warpHeight — the galactic warp's vertical DISPLACEMENT at a radius and
 * azimuth, reproducing `generate.wesl`'s `warpOffset` exactly. Used to place
 * a mixture component's centre at its true warped height; `discWarpShear`
 * is this function's derivative about one component's own centre, not a
 * substitute for it — do not fold the two together.
 */
import type { GalaxyDescription } from '../../@types/galaxy/GalaxyDescription';

export function warpHeight(radius: number, azimuth: number, geometry: GalaxyDescription): number {
  const { warpStrength, warpTwist, warpStartRadius, outerRadius } = geometry;
  if (warpStrength <= 0 || radius <= warpStartRadius) return 0;
  const rel = (radius - warpStartRadius) / Math.max(1e-4, outerRadius - warpStartRadius);
  const node = warpTwist * rel;
  return warpStrength * outerRadius * 0.4 * rel * rel * Math.sin(azimuth - node);
}
