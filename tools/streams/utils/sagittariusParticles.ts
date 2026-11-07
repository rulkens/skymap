/**
 * Sagittarius from the Vasiliev+ 2021 N-body snapshot: a seeded subsample, placed from the
 * catalogue's own sky position and distance, moving along its galactocentric velocity. Bound and
 * stripped stars are picked separately, the bound capped at `SGR_BOUND_SHARE` of the budget (a
 * uniform pick drowned the core in remnant); either class fills what the other cannot, so the
 * budget is never underspent. Colour samples star types at the [Fe/H] of the star's stripping
 * time (metal-rich core, metal-poor old debris); brightness does not follow it, so the old arms
 * are not dimmed into invisibility.
 */
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { galToEq } from '../../utils/math/galToEq';
import { splitmix64Rng } from '../../utils/random/splitmix64Rng';
import { seededPick } from '../../utils/random/seededPick';
import type { StreamParticles } from '../@types/StreamParticles';
import type { VasilievStar } from '../@types/VasilievStar';
import {
  SGR_BOUND_SHARE,
  SGR_LUMINOSITY,
  SGR_PARTICLE_BUDGET,
  SGR_SIZE_KPC,
} from '../data/streamsBuild.constants';
import { sagittariusFeh } from './sagittariusFeh';
import { sampleStreamBv } from './sampleStreamBv';
import { streamColourT } from './streamColourT';

const KPC_TO_MPC = 1e-3;
const BOUND_CAP = Math.floor(SGR_BOUND_SHARE * SGR_PARTICLE_BUDGET);

export function sagittariusParticles(rows: readonly VasilievStar[], seed: bigint): StreamParticles {
  const rng = splitmix64Rng(seed);
  const bound: number[] = [];
  const stripped: number[] = [];
  rows.forEach((s, i) => (s.tStripGyr === 0 ? bound : stripped).push(i));
  const n = Math.min(SGR_PARTICLE_BUDGET, rows.length);
  const nStripped = Math.min(stripped.length, n - Math.min(bound.length, BOUND_CAP));
  // Back into file order, so the pick is the only thing the seed decides.
  const picks = Int32Array.from([
    ...seededPick(bound, n - nStripped, rng),
    ...seededPick(stripped, nStripped, rng),
  ]).sort();

  const positionsMpc = new Float32Array(n * 3);
  const tangents = new Float32Array(n * 3);
  const sizeMpc = new Float32Array(n);
  const luminosity = new Float32Array(n);
  const colourT = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const s = rows[picks[k]!]!;
    const p = raDecDistToEqCart({
      raHours: s.ra / 15,
      decDeg: s.dec,
      distMpc: s.distanceKpc * KPC_TO_MPC,
    });
    positionsMpc.set(p, k * 3);
    tangents.set(normalize3(galToEq([s.vx, s.vy, s.vz])), k * 3);
    luminosity[k] = SGR_LUMINOSITY * (0.5 + 0.5 * rng());
    colourT[k] = streamColourT(sampleStreamBv(sagittariusFeh(s.tStripGyr), rng));
    sizeMpc[k] = (SGR_SIZE_KPC[0] + (SGR_SIZE_KPC[1] - SGR_SIZE_KPC[0]) * rng()) * KPC_TO_MPC;
  }
  return { positionsMpc, tangents, sizeMpc, luminosity, colourT };
}
