/**
 * buildSfMapDustCdf — S1: replaces rejection sampling of the SF map's
 * placement density with an exact inverse-CDF. One pass over every (ring,
 * az) texel accumulates `density(texel, radius, angle) x texelArea` into a
 * running prefix sum; `sampleSfMapDustCdf` then draws exactly proportional
 * to that mass with a single binary search — no rejection, no grid-max
 * normalisation (a CDF needs neither; see
 * docs/research/m74-jwst/07-sprite-seeding.md S1).
 *
 * `density` is a caller-supplied channel blend, not fixed to dust's own
 * `sfMapDustDensity` — every tier that seeds off the map (dust, HII catalog,
 * DIG, associations) weights differently, see each call site. `radius`/
 * `angle` are the texel's own centre, in the same units the ring/az geometry
 * below uses internally (ring-centre radius via `sfMapRingRadius`, bin-centre
 * angle) — a caller reweighting by arm proximity (`hiiRegions.ts`'s
 * `armBias`) needs them; one that doesn't just ignores the extra args.
 *
 * texelArea is an annular-SECTOR area (`0.5 x dTheta x (rOuter^2 -
 * rInner^2)`), not a bare `dr x r x dTheta`: the grid's rings are LOG-spaced
 * (`sfMapRingRadius`), so a linear-width approximation would under-weight
 * the geometrically-wider outer rings and over-seed the centre.
 *
 * Accumulated in a plain JS number (f64) so ~786k adds don't drift; only the
 * STORED prefix entries round to f32 (~3 MB for the 1536x512 grid).
 */
import { sfMapDustRingEdges } from './ismMapDustRingEdges';
import { sfMapRingRadius } from './ismMapRingRadius';
import type { GalaxySfMap } from '../../@types/galaxy/GalaxyIsmMap';
import type { GalaxySfMapDustCdf } from '../../@types/galaxy/GalaxyIsmMapDustCdf';

/**
 * One texel's four decoded channels — see `GalaxySfMap`'s header for what
 * each lane means and the rgba16float packing it comes from.
 * CONTRACT: `buildSfMapDustCdf` hands its `density` callback ONE reused
 * record, mutated per texel — a callback may read it freely but must never
 * retain the reference past its own call, since the next texel overwrites it
 * in place.
 */
export type SfMapDensityTexel = {
  gas: number;
  recentSf: number;
  activity: number;
  dust: number;
};

export function buildSfMapDustCdf(
  map: GalaxySfMap,
  density: (texel: SfMapDensityTexel, radius: number, angle: number) => number,
): GalaxySfMapDustCdf {
  const { az, rings, rMin, rMax, data } = map;
  const dTheta = (2 * Math.PI) / az;
  const prefix = new Float32Array(rings * az);

  // Reused across all ~786k texels rather than a fresh object literal per
  // texel — every call site (`hiiRegions.ts` x3, `dustParticleCloud.ts`)
  // only reads these fields synchronously inside its `density` callback and
  // never stores the record itself, so mutating it in place is safe; see the
  // type's own doc for the contract this relies on.
  const texel: SfMapDensityTexel = { gas: 0, recentSf: 0, activity: 0, dust: 0 };

  let total = 0;
  for (let ring = 0; ring < rings; ring++) {
    const { rInner, rOuter } = sfMapDustRingEdges(ring, rings, rMin, rMax);
    const texelArea = 0.5 * dTheta * (rOuter * rOuter - rInner * rInner);
    const radius = sfMapRingRadius(ring, rings, rMin, rMax);
    for (let azIdx = 0; azIdx < az; azIdx++) {
      const i = (ring * az + azIdx) * 4;
      const angle = (azIdx + 0.5) * dTheta;
      texel.gas = data[i]!;
      texel.recentSf = data[i + 1]!;
      texel.activity = data[i + 2]!;
      texel.dust = data[i + 3]!;
      const d = density(texel, radius, angle);
      total += d * texelArea;
      prefix[ring * az + azIdx] = total;
    }
  }

  return { az, rings, rMin, rMax, prefix, total };
}
