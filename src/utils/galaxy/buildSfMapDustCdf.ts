/**
 * buildSfMapDustCdf — S1: replaces rejection sampling of the SF map's
 * placement density with an exact inverse-CDF. One pass over every (ring,
 * az) texel accumulates `density(gas, recentSf, oldActivity) x texelArea`
 * into a running prefix sum; `sampleSfMapDustCdf` then draws exactly
 * proportional to that mass with a single binary search — no rejection, no
 * grid-max normalisation (a CDF needs neither; see
 * docs/research/m74-jwst/07-sprite-seeding.md S1).
 *
 * `density` is a caller-supplied channel blend, not fixed to dust's own
 * `sfMapDustDensity` — HII event placement (`hiiRegions.ts`) weights by
 * `recentSf` alone instead, see that call site for why.
 *
 * texelArea is an annular-SECTOR area (`0.5 x dTheta x (rOuter^2 -
 * rInner^2)`), not a bare `dr x r x dTheta`: the grid's rings are LOG-spaced
 * (`sfMapRingRadius`), so a linear-width approximation would under-weight
 * the geometrically-wider outer rings and over-seed the centre.
 *
 * Accumulated in a plain JS number (f64) so ~786k adds don't drift; only the
 * STORED prefix entries round to f32 (~3 MB for the 1536x512 grid).
 */
import { sfMapDustRingEdges } from './sfMapDustRingEdges';
import type { GalaxySfMap } from '../../@types/galaxy/GalaxySfMap';
import type { GalaxySfMapDustCdf } from '../../@types/galaxy/GalaxySfMapDustCdf';

export function buildSfMapDustCdf(
  map: GalaxySfMap,
  density: (gas: number, recentSf: number, oldActivity: number) => number,
): GalaxySfMapDustCdf {
  const { az, rings, rMin, rMax, data } = map;
  const dTheta = (2 * Math.PI) / az;
  const prefix = new Float32Array(rings * az);

  let total = 0;
  for (let ring = 0; ring < rings; ring++) {
    const { rInner, rOuter } = sfMapDustRingEdges(ring, rings, rMin, rMax);
    const texelArea = 0.5 * dTheta * (rOuter * rOuter - rInner * rInner);
    for (let azIdx = 0; azIdx < az; azIdx++) {
      const i = (ring * az + azIdx) * 4;
      const d = density(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255);
      total += d * texelArea;
      prefix[ring * az + azIdx] = total;
    }
  }

  return { az, rings, rMin, rMax, prefix, total };
}
