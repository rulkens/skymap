/**
 * The O(n) window filter must agree with a brute-force window everywhere,
 * edges included: rows wrap on a whole-circle grid and clamp on a regional one,
 * columns always clamp, and the row half-width follows 1/cos(lat).
 */

import { describe, it, expect } from 'vitest';

import { windowExtremum } from '../../../../../tools/antique/earth/utils/windowExtremum';
import type { HeightGrid } from '../../../../../tools/antique/earth/@types/HeightGrid';
import { heightLatticeStepDeg } from '../../../../../tools/utils/textures/heightLatticeStepDeg';

const KM_PER_DEG = 111.195;

function bruteForce(grid: HeightGrid, radiusKm: number, op: 'max' | 'min'): Float32Array {
  const { nx, ny, j0, h } = grid;
  const step = heightLatticeStepDeg(grid.z);
  const postKm = step * KM_PER_DEG;
  const ry = Math.max(1, Math.round(radiusKm / postKm));
  const better = op === 'max' ? Math.max : Math.min;
  const out = new Float32Array(nx * ny);
  for (let jj = 0; jj < ny; jj++)
    for (let ii = 0; ii < nx; ii++) {
      let best = op === 'max' ? -Infinity : Infinity;
      for (let dj = -ry; dj <= ry; dj++) {
        const row = Math.min(ny - 1, Math.max(0, jj + dj));
        const cosLat = Math.max(0.05, Math.cos(((90 - (j0 + row) * step) * Math.PI) / 180));
        const rx = Math.min(
          Math.floor((nx - 1) / 2),
          Math.max(1, Math.round(radiusKm / (postKm * cosLat))),
        );
        for (let di = -rx; di <= rx; di++) {
          const col = grid.wraps
            ? (((ii + di) % nx) + nx) % nx
            : Math.min(nx - 1, Math.max(0, ii + di));
          best = better(best, h[row * nx + col]!);
        }
      }
      out[jj * nx + ii] = best;
    }
  return out;
}

describe('windowExtremum', () => {
  it('matches a brute-force window on wrapping and clamped grids', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 1000;
    // z 1: 256 posts round, 1.4° apart; rows 20..43 span 62°N to 30°N.
    for (const wraps of [true, false]) {
      const nx = wraps ? 256 : 40;
      const grid: HeightGrid = {
        z: 1,
        i0: 0,
        j0: 20,
        nx,
        ny: 24,
        wraps,
        h: Float32Array.from({ length: nx * 24 }, random),
      };
      for (const op of ['max', 'min'] as const) {
        expect(windowExtremum(grid.h, grid, 400, op)).toEqual(bruteForce(grid, 400, op));
      }
    }
  });
});
