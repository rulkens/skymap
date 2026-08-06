/**
 * sfMapRingMeans — per-ring mean of one extracted channel, over every
 * azimuth in that ring (a row of the map's (ring, az) grid). The radial
 * envelope `dustParticleCloud.ts`'s placement CDF preserves EXACTLY
 * regardless of the placement cap — see that file's own header — is built
 * from this array, not a single map-wide mean, so a ring's measured dust
 * profile survives no matter how aggressively its own azimuth is capped.
 * Returns a `Float32Array` (not `number[]`) so `createGalaxyModel.ts` can
 * hand the result straight to `GPUQueue.writeBuffer` with no conversion.
 */
import type { GalaxySfMap } from '../../@types/galaxy/GalaxySfMap';
import type { SfMapDensityTexel } from './buildSfMapDustCdf';

export function sfMapRingMeans(
  map: GalaxySfMap,
  extract: (texel: SfMapDensityTexel) => number,
): Float32Array {
  const { az, rings, data } = map;
  const means = new Float32Array(rings);
  if (az <= 0) return means;
  for (let ring = 0; ring < rings; ring++) {
    let sum = 0;
    for (let azIdx = 0; azIdx < az; azIdx++) {
      const base = (ring * az + azIdx) * 4;
      sum += extract({
        gas: data[base]!,
        recentSf: data[base + 1]!,
        activity: data[base + 2]!,
        dust: data[base + 3]!,
      });
    }
    means[ring] = sum / az;
  }
  return means;
}
