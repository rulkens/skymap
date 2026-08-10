import { describe, expect, it } from 'vitest';

import { blockAverageCube } from '../../../../tools/utils/volume/blockAverageCube';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('blockAverageCube', () => {
  // n = i*16 + j*4 + k (C-order, axis 0 slowest) — hand-computed below,
  // never derived from the function under test.
  const dims: Vec3 = [4, 4, 4];
  const values = Float32Array.from({ length: 64 }, (_, n) => n);

  it('averages each 2×2×2 block in C-order', () => {
    const result = blockAverageCube({
      values,
      dims,
      origin: [0, 0, 0],
      voxelSizeMpc: 1,
      factor: 2,
    });

    expect(result.dims).toEqual([2, 2, 2]);
    // First block: {0,1,4,5,16,17,20,21} → sum 84 → 84/8 = 10.5
    expect(result.values[0]).toBe(10.5);
    // Last block: {42,43,46,47,58,59,62,63} → sum 420 → 420/8 = 52.5
    expect(result.values[7]).toBe(52.5);
  });

  it('halves the grid and doubles the voxel size, leaving the origin put', () => {
    const origin: Vec3 = [-100, -50, 25];
    const result = blockAverageCube({
      values,
      dims,
      origin,
      voxelSizeMpc: 1.5,
      factor: 2,
    });

    expect(result.origin).toEqual([-100, -50, 25]);
    expect(result.voxelSizeMpc).toBe(3);
  });

  it('rejects dims that do not divide by the factor', () => {
    const oddDims: Vec3 = [4, 4, 3];
    const oddValues = new Float32Array(4 * 4 * 3);

    expect(() =>
      blockAverageCube({
        values: oddValues,
        dims: oddDims,
        origin: [0, 0, 0],
        voxelSizeMpc: 1,
        factor: 2,
      }),
    ).toThrow('not divisible by 2');
  });
});
