/**
 * clippedHeightSource's post-range arithmetic: an off-by-one here either
 * drops the shared edge post (a crack against the neighbour tile) or asks
 * the inner source for posts outside the site window.
 */

import { describe, expect, it } from 'vitest';

import { clippedHeightSource } from '../../../tools/textures/clippedHeightSource';
import type { HeightSource } from '../../../tools/textures/HeightSource';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';

describe('clippedHeightSource', () => {
  it('reads only the posts inside the extent, edges included, and NaNs the rest', async () => {
    const calls: number[][] = [];
    // Each post's value encodes its GLOBAL index, so a misplaced paste shows.
    const inner: HeightSource = {
      id: 'fake',
      attribution: 'fake',
      maxLevel: 20,
      coverage: [],
      provenance: { sourceId: 'fake', attribution: 'fake', vintage: 'n/a' },
      async readGrid(z, i0, j0, nx, ny) {
        calls.push([z, i0, j0, nx, ny]);
        const grid = new Float32Array(nx * ny);
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i < nx; i++) grid[j * nx + i] = (i0 + i) * 100 + (j0 + j);
        }
        return grid;
      },
      async boundsInBox() {
        return null;
      },
    };
    const step = heightLatticeStepDeg(0);
    const source = clippedHeightSource(inner, {
      west: -180 + 2 * step,
      east: -180 + 4 * step,
      north: 90 - step,
      south: 90 - 3 * step,
    });

    const grid = await source.readGrid(0, 0, 0, 6, 5);

    expect(calls).toEqual([[0, 2, 1, 3, 3]]);
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 6; i++) {
        const inside = i >= 2 && i <= 4 && j >= 1 && j <= 3;
        expect(grid![j * 6 + i], `post (${i}, ${j})`).toBe(inside ? i * 100 + j : Number.NaN);
      }
    }
    expect(await source.readGrid(0, 5, 0, 3, 3)).toBeNull();
  });
});
