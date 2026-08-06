/**
 * sampleIsmMapEventPosition — draws one world position exactly proportional
 * to a built ISM-map CDF (`sampleIsmMapDustCdf`), warp-lifted the way every
 * other map-seeded placement is (`warpHeight`) — a flat placement here would
 * be a regression against the arm-ridge path it stands in for.
 *
 * x/z axis pairing mirrors `placeMapDensityComplex` in
 * `clusteredDiscPlacement.ts` (`x = cos(angle)*radius`, `z = sin(angle)*radius`),
 * which itself matches `ismMapPresent.wesl`'s `atan2(z, x)` convention (see
 * `sampleGalaxyIsmMap.ts`'s header).
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
