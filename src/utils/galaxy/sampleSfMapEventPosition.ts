/**
 * sampleSfMapEventPosition — draws one world position exactly proportional
 * to a built SF-map CDF (`sampleSfMapDustCdf`), warp-lifted the way every
 * other map-seeded placement is (`warpHeight`) — a flat placement here would
 * be a regression against the arm-ridge path it stands in for.
 *
 * x/z axis pairing mirrors `placeMapDensityComplex` in
 * `clusteredDiscPlacement.ts` (`x = cos(angle)*radius`, `z = sin(angle)*radius`),
 * which itself matches `sfMapPresent.wesl`'s `atan2(z, x)` convention (see
 * `sampleGalaxySfMap.ts`'s header).
 */
import { sampleSfMapDustCdf } from './sampleSfMapDustCdf';
import { warpHeight } from './warpHeight';
import type { GalaxyDescription } from '../../@types/galaxy/GalaxyDescription';
import type { GalaxySfMapDustCdf } from '../../@types/galaxy/GalaxySfMapDustCdf';
import type { Vec3 } from '../../@types/math/Vec3';

export function sampleSfMapEventPosition(
  cdf: GalaxySfMapDustCdf,
  geometry: GalaxyDescription,
  rng: () => number,
): Vec3 {
  const { radius, angle } = sampleSfMapDustCdf(cdf, rng);
  return [radius * Math.cos(angle), warpHeight(radius, angle, geometry), radius * Math.sin(angle)];
}
