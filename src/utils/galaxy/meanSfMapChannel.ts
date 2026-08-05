/**
 * meanSfMapChannel — the plain (unweighted) mean of one extracted quantity
 * over every texel of an `GalaxySfMap`. Used to bring the legacy `gas x
 * oldActivity` product and the swept dust channel (its overshoot above
 * ambient — see `sweptDustOvershoot`) onto a common scale before `sweptMix`
 * blends them: the two have unrelated
 * magnitudes (one is a bounded [0,1] product, the other an unclamped
 * conserved quantity that overshoots past 8), so blending raw values would
 * let whichever term happens to be bigger dominate at any mix short of the
 * endpoints.
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
