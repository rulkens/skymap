/**
 * sampleIsmMapEventPosition — draws one world position proportional to a
 * built ISM-map CDF (`sampleIsmMapDustCdf`), warp-lifted like every other
 * map-seeded placement (`warpHeight`) — flat here would regress the
 * arm-ridge path this stands in for.
 *
 * x/z pairing (`cos(angle)*radius`, `sin(angle)*radius`) matches the
 * `atan2(z, x)` convention shared by the generator shaders and
 * `clusteredDiscPlacement.ts`'s `placeMapDensityComplex`.
 */
import { sampleIsmMapDustCdf } from './sampleIsmMapDustCdf';
import { warpHeight } from './warpHeight';
import type { GalaxyDescription } from '../../@types/galaxy/GalaxyDescription';
import type { GalaxyIsmMapDustCdf } from '../../@types/galaxy/GalaxyIsmMapDustCdf';
import type { Vec3 } from '../../@types/math/Vec3';

export function sampleIsmMapEventPosition(
  cdf: GalaxyIsmMapDustCdf,
  geometry: GalaxyDescription,
  rng: () => number,
): Vec3 {
  const { radius, angle } = sampleIsmMapDustCdf(cdf, rng);
  return [radius * Math.cos(angle), warpHeight(radius, angle, geometry), radius * Math.sin(angle)];
}
