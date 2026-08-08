/**
 * meanIsmMapChannel — the plain (unweighted) mean of one extracted quantity
 * over every texel of an `GalaxyIsmMap`. `dustParticleCloud.ts` normalises the
 * swept dust channel's overshoot (`sweptDustOvershoot`) by its own map-wide
 * mean before building the placement CDF from it, so the CDF sampler's guard
 * (`SWEPT_OVERSHOOT_MEAN_EPS`) reads a scale-free quantity rather than the
 * unclamped, rim-overshooting-past-8 raw value.
 */
import type { GalaxyIsmMap } from '../../@types/galaxy/GalaxyIsmMap';
import type { IsmMapDensityTexel } from './buildIsmMapDustCdf';

export function meanIsmMapChannel(
  map: GalaxyIsmMap,
  extract: (texel: IsmMapDensityTexel) => number,
): number {
  const { az, rings, data } = map;
  const count = rings * az;
  if (count <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    sum += extract({
      gas: data[base]!,
      stars: data[base + 1]!,
      activity: data[base + 2]!,
      dust: data[base + 3]!,
    });
  }
  return sum / count;
}
