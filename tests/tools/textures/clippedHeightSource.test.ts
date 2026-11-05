/**
 * clippedHeightSource's post-range arithmetic and feather: an off-by-one
 * either drops the shared edge post or asks the inner source for posts
 * outside the site window; an edge post that is not exactly the underfill's
 * value leaves a step against the tile beyond (the Endeavour wall).
 */

import { describe, expect, it } from 'vitest';

import { clippedHeightSource } from '../../../tools/textures/clippedHeightSource';
import type { HeightSource } from '../../../tools/textures/@types/HeightSource';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';

/** Each post's value encodes its GLOBAL index and `sign`, so a misplaced
 *  paste or the wrong source shows. */
function indexSource(sign: number, calls: number[][]): HeightSource {
  return {
    id: 'fake',
    attribution: 'fake',
    maxLevel: 20,
    coverage: [],
    provenance: { sourceId: 'fake', attribution: 'fake', vintage: 'n/a' },
    async readGrid(z, i0, j0, nx, ny) {
      calls.push([z, i0, j0, nx, ny]);
      const grid = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) grid[j * nx + i] = sign * ((i0 + i) * 100 + (j0 + j));
      }
      return grid;
    },
    async boundsInBox() {
      return null;
    },
  };
}

describe('clippedHeightSource', () => {
  const step = heightLatticeStepDeg(0);

  it('reads only the posts inside the extent, NaNs the rest, and hands the edge to the underfill', async () => {
    const calls: number[][] = [];
    const underfillCalls: number[][] = [];
    const extent = {
      west: -180 + 2 * step,
      east: -180 + 4 * step,
      north: 90 - step,
      south: 90 - 3 * step,
    };
    const core = {
      west: extent.west + 1e-9,
      east: extent.east - 1e-9,
      north: extent.north - 1e-9,
      south: extent.south + 1e-9,
    };
    const source = clippedHeightSource(
      indexSource(1, calls),
      indexSource(-1, underfillCalls),
      extent,
      core,
    );

    const grid = await source.readGrid(0, 0, 0, 6, 5);

    expect(calls).toEqual([[0, 2, 1, 3, 3]]);
    expect(underfillCalls).toEqual([[0, 2, 1, 3, 3]]);
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 6; i++) {
        const inside = i >= 2 && i <= 4 && j >= 1 && j <= 3;
        const interior = i === 3 && j === 2;
        const expected = interior ? i * 100 + j : inside ? -(i * 100 + j) : Number.NaN;
        expect(grid![j * 6 + i], `post (${i}, ${j})`).toBe(expected);
      }
    }
    expect(await source.readGrid(0, 5, 0, 3, 3)).toBeNull();
  });

  it('blends from the underfill to the source across the ring', async () => {
    const extent = { west: -180, east: -180 + 8 * step, north: 90, south: 90 - 8 * step };
    const core = {
      west: -180 + 4 * step,
      east: extent.east,
      north: extent.north,
      south: extent.south,
    };
    const source = clippedHeightSource(indexSource(1, []), indexSource(-1, []), extent, core);

    const grid = await source.readGrid(0, 0, 4, 5, 1);

    // Row j = 4: inner 100·i + 4, underfill its negation; halfway is zero.
    expect(grid![2]).toBeCloseTo(0, 4);
    expect(grid![1]).toBeLessThan(grid![2]!);
    expect(grid![3]).toBeGreaterThan(grid![2]!);
    expect(grid![4]).toBe(404);
  });
});
