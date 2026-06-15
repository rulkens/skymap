import { describe, it, expect } from 'vitest';
import { voxelToEqCart } from '../../../../tools/utils/math/voxelToEqCart';

describe('voxelToEqCart', () => {
  it('returns finite Cartesian for the centre voxel', () => {
    // 128³ cube, voxel size 1, dim 128: voxel (64,64,64) sits near origin.
    const eq = voxelToEqCart([64, 64, 64], [128, 128, 128], 1);
    // Magnitude is the SG-vector length put through SG→EQ rotation —
    // length-preserving, so we just sanity-check it is finite.
    expect(Number.isFinite(eq[0])).toBe(true);
    expect(Number.isFinite(eq[1])).toBe(true);
    expect(Number.isFinite(eq[2])).toBe(true);
  });
});
