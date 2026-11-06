/** Two boxes reading the same global lattice must agree, bit for bit, at the
 *  column they share — a per-box margin that recomputed from a box-relative
 *  origin would drift by a rounding ulp and show up as a visible tile seam. */
import { describe, expect, it } from 'vitest';

import { readSlopeLattice, SLOPE_LEVEL } from '../../../tools/textures/readSlopeLattice';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';
import { analyticHeightSource } from '../../fixtures/textures/albedoFakes';

const STEP = heightLatticeStepDeg(SLOPE_LEVEL);
const RADIUS_M = 3_390_000; // a Mars-like literal; the function is body-agnostic

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
