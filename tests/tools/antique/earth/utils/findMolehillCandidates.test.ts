/**
 * Hill country draws no molehills: a crest needs real relief at every spacing, and
 * a real range around it, however fine the grid.
 */

import { describe, it, expect } from 'vitest';

import { findMolehillCandidates } from '../../../../../tools/antique/earth/utils/findMolehillCandidates';
import type { HeightGrid } from '../../../../../tools/antique/earth/@types/HeightGrid';

const SIZE = 160;
const POST_KM = 4.9;
// Gaussian bump on 0 m land, `width` km: one crest at the centre.
const bump = (top: number, widthKm: number): HeightGrid => {
  const h = new Float32Array(SIZE * SIZE);
  for (let jj = 0; jj < SIZE; jj++)
    for (let ii = 0; ii < SIZE; ii++) {
      const km = Math.hypot(ii - SIZE / 2, jj - SIZE / 2) * POST_KM;
      h[jj * SIZE + ii] = 1 + top * Math.exp(-((km / widthKm) ** 2));
    }
  return { z: 6, i0: 0, j0: 4016, nx: SIZE, ny: SIZE, wraps: false, h };
};
const crests = (grid: HeightGrid, spacingKm: number) =>
  findMolehillCandidates(grid, spacingKm, () => true).length;

describe('findMolehillCandidates', () => {
  it('rejects a 400 m crest at a fine spacing, where the scaled threshold alone would keep it', () => {
    expect(crests(bump(400, 60), 8)).toBe(0);
  });
  it('rejects a 900 m hill no range surrounds, keeps a 3,000 m range crest', () => {
    expect(crests(bump(900, 20), 8)).toBe(0);
    expect(crests(bump(3000, 60), 8)).toBeGreaterThan(0);
  });
});
