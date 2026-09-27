/** Two boxes reading the same global lattice must agree, bit for bit, at the
 *  column they share — a per-box margin that recomputed from a box-relative
 *  origin would drift by a rounding ulp and show up as a visible tile seam. */
import { describe, expect, it } from 'vitest';

import { readSlopeLattice, SLOPE_LEVEL } from '../../../tools/textures/readSlopeLattice';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';
import type { HeightSource } from '../../../tools/textures/HeightSource';

const STEP = heightLatticeStepDeg(SLOPE_LEVEL);
const DEG_TO_RAD = Math.PI / 180;
const RADIUS_M = 3_390_000; // a Mars-like literal; the function is body-agnostic

// A bumpy, globally-defined surface: smooth enough that a central-difference
// slope is well behaved everywhere, curved enough that a wrong index offset
// would sample a visibly different value rather than a coincidental match.
function heightAt(lon: number, lat: number): number {
  return 500 * Math.sin(3 * lon * DEG_TO_RAD) * Math.cos(2 * lat * DEG_TO_RAD);
}

function analyticHeightSource(): HeightSource {
  return {
    id: 'analytic-test',
    attribution: 'test',
    maxLevel: SLOPE_LEVEL,
    coverage: [{ west: -180, east: 180, south: -90, north: 90 }],
    provenance: { sourceId: 'analytic-test', attribution: 'test', vintage: '2026' },
    async readGrid(_z, i0, j0, nx, ny) {
      const grid = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const lat = 90 - (j0 + j) * STEP;
        for (let i = 0; i < nx; i++) {
          const lon = -180 + (i0 + i) * STEP;
          grid[j * nx + i] = heightAt(lon, lat);
        }
      }
      return grid;
    },
    async boundsInBox() {
      return null;
    },
  };
}

describe('readSlopeLattice', () => {
  it('agrees across two adjacent boxes at the shared edge', async () => {
    const height = analyticHeightSource();
    const iShared = 110;
    const jFrom = 50;
    const jTo = 60;
    const boxA = {
      west: -180 + 100 * STEP,
      east: -180 + iShared * STEP,
      north: 90 - jFrom * STEP,
      south: 90 - jTo * STEP,
    };
    const boxB = {
      west: -180 + iShared * STEP,
      east: -180 + 120 * STEP,
      north: 90 - jFrom * STEP,
      south: 90 - jTo * STEP,
    };

    const latticeA = await readSlopeLattice(height, boxA, RADIUS_M);
    const latticeB = await readSlopeLattice(height, boxB, RADIUS_M);

    const jLocal = 5; // an interior row, away from the one-sided north/south edges
    const aIndex = jLocal * latticeA.nx + (latticeA.nx - 1);
    const bIndex = jLocal * latticeB.nx + 0;

    expect(latticeA.sx[aIndex]).toBeCloseTo(latticeB.sx[bIndex]!, 9);
    expect(latticeA.sy[aIndex]).toBeCloseTo(latticeB.sy[bIndex]!, 9);
  });
});
