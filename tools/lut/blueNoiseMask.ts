/**
 * blueNoiseMask — a void-and-cluster ordering (Ulichney 1993) over a size × size × slices torus,
 * as r8 ranks. The energy is separable: a spatial Gaussian between cells of one slice, a temporal
 * one between the slices of one pixel, nothing between cells sharing neither. Each slice comes out
 * spatially blue and each pixel's sequence spread over time, which is what lets a short running
 * mean of jittered marches converge.
 *
 * The kernel is translation-invariant, so a cell's energy from the ones plus its energy from the
 * zeros is a constant: the second half's "tightest cluster of zeros" is the first half's
 * "largest void", and one insert loop ranks every cell from the initial pattern up.
 */
import { mulberry32 } from '../../packages/shared/src/utils/random/mulberry32';

const SIGMA = 1.9;
const SPATIAL_RADIUS = 6; // ≈ 3σ
const INITIAL_FILL = 0.1;

function gaussian(distance: number): number {
  return Math.exp(-(distance * distance) / (2 * SIGMA * SIGMA));
}

/** Spatial (dx, dy) and temporal (dt) neighbours, each torus residue at most once. */
function buildKernel(size: number, slices: number) {
  const radius = Math.min(SPATIAL_RADIUS, Math.floor((size - 1) / 2));
  const spatial = { dx: [] as number[], dy: [] as number[], weights: [] as number[] };
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      spatial.dx.push(dx);
      spatial.dy.push(dy);
      spatial.weights.push(gaussian(Math.hypot(dx, dy)));
    }
  }
  const temporal = { dt: [] as number[], weights: [] as number[] };
  for (let dt = 1; dt < slices; dt += 1) {
    temporal.dt.push(dt);
    temporal.weights.push(gaussian(Math.min(dt, slices - dt)));
  }
  return { spatial, temporal };
}

export function blueNoiseMask(size: number, slices: number, seed: number): Uint8Array {
  const area = size * size;
  const count = area * slices;
  const { spatial, temporal } = buildKernel(size, slices);

  const splat = (energy: Float64Array, cell: number, sign: number): void => {
    const s = Math.floor(cell / area);
    const y = Math.floor((cell % area) / size);
    const x = cell % size;
    for (let i = 0; i < spatial.weights.length; i += 1) {
      const ny = (y + spatial.dy[i]! + size) % size;
      const nx = (x + spatial.dx[i]! + size) % size;
      energy[s * area + ny * size + nx]! += sign * spatial.weights[i]!;
    }
    for (let i = 0; i < temporal.weights.length; i += 1) {
      const ns = (s + temporal.dt[i]!) % slices;
      energy[ns * area + y * size + x]! += sign * temporal.weights[i]!;
    }
  };
  const extreme = (energy: Float64Array, ones: Uint8Array, want: 0 | 1): number => {
    let best = -1;
    for (let i = 0; i < count; i += 1) {
      if (ones[i] !== want) continue;
      if (best < 0 || (want === 1 ? energy[i]! > energy[best]! : energy[i]! < energy[best]!))
        best = i;
    }
    return best;
  };

  // Seeded random initial pattern, relaxed until the tightest cluster is the largest void.
  const ones = new Uint8Array(count);
  const energy = new Float64Array(count);
  const rand = mulberry32(seed);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const initial = Math.max(1, Math.floor(count * INITIAL_FILL));
  for (let i = 0; i < initial; i += 1) {
    ones[order[i]!] = 1;
    splat(energy, order[i]!, 1);
  }
  for (;;) {
    const cluster = extreme(energy, ones, 1);
    ones[cluster] = 0;
    splat(energy, cluster, -1);
    const voidCell = extreme(energy, ones, 0);
    // `<=`: on a tie the removed cell wins, or equal-energy swaps could cycle forever.
    if (energy[cluster]! <= energy[voidCell]!) {
      ones[cluster] = 1;
      splat(energy, cluster, 1);
      break;
    }
    ones[voidCell] = 1;
    splat(energy, voidCell, 1);
  }

  const rank = new Uint32Array(count);
  const phaseOnes = Uint8Array.from(ones);
  const phaseEnergy = Float64Array.from(energy);
  for (let n = initial - 1; n >= 0; n -= 1) {
    const cluster = extreme(phaseEnergy, phaseOnes, 1);
    phaseOnes[cluster] = 0;
    splat(phaseEnergy, cluster, -1);
    rank[cluster] = n;
  }
  for (let n = initial; n < count; n += 1) {
    const voidCell = extreme(energy, ones, 0);
    ones[voidCell] = 1;
    splat(energy, voidCell, 1);
    rank[voidCell] = n;
  }

  const out = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) out[i] = Math.floor((rank[i]! * 256) / count);
  return out;
}
