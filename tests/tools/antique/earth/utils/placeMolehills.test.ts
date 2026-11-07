/**
 * Molehill levels nest: a finer level never moves or drops a coarser level's
 * hill, and at every level the hills revealed so far keep that level's
 * spacing on the sphere, across the antimeridian too.
 */

import { describe, it, expect } from 'vitest';

import { placeMolehills } from '../../../../../tools/antique/earth/utils/placeMolehills';
import type { HeightSource } from '../../../../../tools/textures/@types/HeightSource';
import type { MolehillLevelPlan } from '../../../../../tools/antique/earth/@types/MolehillLevelPlan';
import { heightLatticeStepDeg } from '../../../../../tools/utils/textures/heightLatticeStepDeg';
import { lonLatDegToDirection } from '../../../../../src/utils/geo/lonLatDegToDirection';
import { distance3 } from '../../../../../src/utils/math/distance3';

const R = 6371;
const SPACING_KM0 = 2000;
const PEAKS: readonly [number, number, number][] = [
  [10, 45, 6000],
  [14, 41, 4500],
  [178.6, 0, 6000],
  [-178.6, 0.5, 5500],
  [-70, -20, 6500],
  [-66, -26, 4000],
];
const WORLD = { west: -180, east: 180, south: -90, north: 90 };

// Gaussian ranges (~300 km wide) rising from a 100 m deep sea.
const peakDirs = PEAKS.map(([lonDeg, latDeg]) => lonLatDegToDirection({ lonDeg, latDeg }));
const heightAt = (lonDeg: number, latDeg: number) => {
  const p = lonLatDegToDirection({ lonDeg, latDeg });
  return PEAKS.reduce(
    (h, [, , top], k) => h + top * Math.exp(-(((distance3(p, peakDirs[k]!) * R) / 300) ** 2)),
    -100,
  );
};
const source = {
  async readGrid(z: number, i0: number, j0: number, nx: number, ny: number) {
    const step = heightLatticeStepDeg(z);
    const h = new Float32Array(nx * ny);
    for (let jj = 0; jj < ny; jj++)
      for (let ii = 0; ii < nx; ii++)
        h[jj * nx + ii] = heightAt(-180 + (i0 + ii) * step, 90 - (j0 + jj) * step);
    return h;
  },
} as unknown as HeightSource;
const plans = (levels: number): MolehillLevelPlan[] =>
  Array.from({ length: levels }, (_, level) => ({ level, z: 2, box: WORLD }));

describe('placeMolehills', () => {
  it('keeps every coarser hill when finer levels are added, each level Poisson-spaced', async () => {
    const coarse = await placeMolehills(source, plans(1), { spacingKm0: SPACING_KM0, radiusKm: R });
    const fine = await placeMolehills(source, plans(3), { spacingKm0: SPACING_KM0, radiusKm: R });
    expect(coarse.length).toBeGreaterThan(0);
    expect(fine.filter((hill) => hill.level === 0)).toEqual(coarse);
    expect(fine.length).toBeGreaterThan(coarse.length);

    for (let level = 0; level < 3; level++) {
      const shown = fine
        .filter((hill) => hill.level <= level)
        .map((hill) => lonLatDegToDirection(hill));
      const chord = SPACING_KM0 / 2 ** level / R;
      for (let a = 0; a < shown.length; a++)
        for (let b = a + 1; b < shown.length; b++)
          expect(distance3(shown[a]!, shown[b]!)).toBeGreaterThanOrEqual(chord);
    }
    // The two peaks either side of the antimeridian, ~310 km apart, never both carry a hill at 500 km.
    expect(
      fine.filter((hill) => Math.abs(hill.latDeg) < 3 && Math.abs(hill.lonDeg) > 175),
    ).toHaveLength(1);
    // ~1 s alone; the margin is for a loaded CI runner.
  }, 20_000);
});
