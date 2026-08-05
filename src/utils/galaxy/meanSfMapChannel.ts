/**
 * meanSfMapChannel — the plain (unweighted) mean of one extracted quantity
 * over every texel of an `GalaxySfMap`. `dustParticleCloud.ts` normalises the
 * swept dust channel's overshoot (`sweptDustOvershoot`) by its own map-wide
 * mean before building the placement CDF from it, so the CDF sampler's guard
 * (`SWEPT_OVERSHOOT_MEAN_EPS`) reads a scale-free quantity rather than the
 * unclamped, rim-overshooting-past-8 raw value.
 */
import type { GalaxySfMap } from '../../@types/galaxy/GalaxySfMap';
import type { SfMapDensityTexel } from './buildSfMapDustCdf';

export function meanSfMapChannel(
  map: GalaxySfMap,
  extract: (texel: SfMapDensityTexel) => number,
): number {
  const { az, rings, data } = map;
  const count = rings * az;
  if (count <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    sum += extract({
      gas: data[base]!,
      recentSf: data[base + 1]!,
      oldActivity: data[base + 2]!,
      dust: data[base + 3]!,
    });
  }
  return sum / count;
}
