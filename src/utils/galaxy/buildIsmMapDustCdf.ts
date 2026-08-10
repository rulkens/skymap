/**
 * buildIsmMapDustCdf — math-derivation contract: the annular-sector area
 * term below isn't obvious from the log-radial grid alone. Accumulates
 * `density(texel, radius, angle) x texelArea` into a running prefix sum per
 * (ring, az) texel, so sampling can draw proportional to mass via one binary
 * search — no rejection, no grid-max normalisation.
 *
 * `density` is caller-supplied: every seeding tier (dust, HII, DIG) weights
 * channels differently, see call sites. `radius`/`angle` are the texel's own
 * centre, letting a caller reweight by arm proximity (`hiiRegions.ts`'s
 * `armBias`).
 *
 * texelArea is an annular-SECTOR area (`0.5 x dTheta x (rOuter^2 -
 * rInner^2)`), not `dr x r x dTheta`: rings are LOG-spaced, so the linear
 * approximation would under-weight the wider outer rings and over-seed the
 * centre. Accumulated in f64 so ~786k adds don't drift; only the stored
 * prefix rounds to f32.
 */
import { ismMapDustRingEdges } from './ismMapDustRingEdges';
import { ismMapRingRadius } from './ismMapRingRadius';
import type { GalaxyIsmMap } from '../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapDustCdf } from '../../@types/galaxy/GalaxyIsmMapDustCdf';

/**
 * One texel's four decoded channels — see `GalaxyIsmMap`'s header for what
 * each lane means and the rgba16float packing it comes from.
 * CONTRACT: `buildIsmMapDustCdf` hands its `density` callback ONE reused
 * record, mutated per texel — a callback may read it freely but must never
 * retain the reference past its own call, since the next texel overwrites it
 * in place.
 */
export type IsmMapDensityTexel = {
  gas: number;
  stars: number;
  activity: number;
  dust: number;
};

export function buildIsmMapDustCdf(
  map: GalaxyIsmMap,
  density: (texel: IsmMapDensityTexel, radius: number, angle: number) => number,
): GalaxyIsmMapDustCdf {
  const { az, rings, rMin, rMax, data } = map;
  const dTheta = (2 * Math.PI) / az;
  const prefix = new Float32Array(rings * az);

  // Reused per texel rather than allocated fresh — see IsmMapDensityTexel's
  // own doc for the mutation contract this relies on.
  const texel: IsmMapDensityTexel = { gas: 0, stars: 0, activity: 0, dust: 0 };

  let total = 0;
  for (let ring = 0; ring < rings; ring++) {
    const { rInner, rOuter } = ismMapDustRingEdges(ring, rings, rMin, rMax);
    const texelArea = 0.5 * dTheta * (rOuter * rOuter - rInner * rInner);
    const radius = ismMapRingRadius(ring, rings, rMin, rMax);
    for (let azIdx = 0; azIdx < az; azIdx++) {
      const i = (ring * az + azIdx) * 4;
      const angle = (azIdx + 0.5) * dTheta;
      texel.gas = data[i]!;
      texel.stars = data[i + 1]!;
      texel.activity = data[i + 2]!;
      texel.dust = data[i + 3]!;
      const d = density(texel, radius, angle);
      total += d * texelArea;
      prefix[ring * az + azIdx] = total;
    }
  }

  return { az, rings, rMin, rMax, prefix, total };
}
