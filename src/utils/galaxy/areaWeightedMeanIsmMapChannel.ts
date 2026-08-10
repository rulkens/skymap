/**
 * areaWeightedMeanIsmMapChannel — the texel-AREA-weighted mean of one
 * extracted quantity over a `GalaxyIsmMap`: the log-radial grid's outer
 * rings each cover far more physical area than the inner ones
 * (`ismMapDustRingEdges`, `buildIsmMapDustCdf`'s own `texelArea`), so an
 * unweighted per-texel mean over-counts the centre. Every texel within one
 * ring shares the same area, so this reduces to a per-ring mean weighted by
 * that ring's own annulus area rather than a full per-texel accumulation —
 * `dTheta` cancels in the ratio, so it never needs computing.
 */
import { ismMapDustRingEdges } from './ismMapDustRingEdges';
import type { GalaxyIsmMap } from '../../@types/galaxy/GalaxyIsmMap';
import type { IsmMapDensityTexel } from './buildIsmMapDustCdf';

export function areaWeightedMeanIsmMapChannel(
  map: GalaxyIsmMap,
  extract: (texel: IsmMapDensityTexel) => number,
): number {
  const { az, rings, rMin, rMax, data } = map;
  if (az <= 0 || rings <= 0) return 0;
  const texel: IsmMapDensityTexel = { gas: 0, stars: 0, activity: 0, dust: 0 };
  let weightedSum = 0;
  let areaSum = 0;
  for (let ring = 0; ring < rings; ring++) {
    const { rInner, rOuter } = ismMapDustRingEdges(ring, rings, rMin, rMax);
    const ringArea = rOuter * rOuter - rInner * rInner;
    let ringSum = 0;
    for (let azIdx = 0; azIdx < az; azIdx++) {
      const base = (ring * az + azIdx) * 4;
      texel.gas = data[base]!;
      texel.stars = data[base + 1]!;
      texel.activity = data[base + 2]!;
      texel.dust = data[base + 3]!;
      ringSum += extract(texel);
    }
    weightedSum += ringArea * (ringSum / az);
    areaSum += ringArea;
  }
  return areaSum > 0 ? weightedSum / areaSum : 0;
}
