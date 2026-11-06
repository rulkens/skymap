/**
 * Sagittarius from the Vasiliev+ 2021 N-body snapshot: a seeded uniform subsample, placed from the
 * catalogue's own sky position and distance, moving along its galactocentric velocity. Colour
 * follows stripping time (bound and fresh debris amber, old debris blue); brightness does not,
 * so the old arms are not dimmed into invisibility.
 */
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { galToEq } from '../../utils/math/galToEq';
import { splitmix64Rng } from '../../utils/random/splitmix64Rng';
import { clamp } from '../../utils/textures/clamp';
import type { StreamParticles } from '../@types/StreamParticles';
import type { VasilievStar } from '../@types/VasilievStar';
import {
  SGR_LUMINOSITY,
  SGR_OLDEST_STRIP_GYR,
  SGR_PARTICLE_BUDGET,
  SGR_SIZE_KPC,
} from '../data/streamsBuild.constants';

const KPC_TO_MPC = 1e-3;

export function sagittariusParticles(rows: readonly VasilievStar[], seed: bigint): StreamParticles {
  const rng = splitmix64Rng(seed);
  // Partial Fisher–Yates, then back into file order so the pick is the only thing the seed decides.
  const order = Int32Array.from(rows, (_, i) => i);
  const n = Math.min(SGR_PARTICLE_BUDGET, rows.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (rows.length - i));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const picks = order.subarray(0, n).sort();

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
    colourT[k] = clamp(1 + s.tStripGyr / SGR_OLDEST_STRIP_GYR, 0, 1) * 0.8 + 0.2 * rng();
    sizeMpc[k] = (SGR_SIZE_KPC[0] + (SGR_SIZE_KPC[1] - SGR_SIZE_KPC[0]) * rng()) * KPC_TO_MPC;
  }
  return { positionsMpc, tangents, sizeMpc, luminosity, colourT };
}
