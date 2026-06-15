import { describe, it, expect } from 'vitest';
import { sgToVoxelIndex } from '../../../../tools/utils/math/sgToVoxelIndex';

describe('sgToVoxelIndex', () => {
  it('linearly maps SG Mpc onto the 128³ CF-4 grid', () => {
    // ORIGIN_MPC = -500, VOXEL_SIZE_MPC = 1000/128 ≈ 7.8125.
    // Origin (-500,-500,-500) → voxel (0,0,0); centre (0,0,0) → 64.
    expect(sgToVoxelIndex([-500, -500, -500])).toEqual([0, 0, 0]);
    const centre = sgToVoxelIndex([0, 0, 0]);
    expect(centre[0]).toBeCloseTo(64, 9);
    expect(centre[1]).toBeCloseTo(64, 9);
    expect(centre[2]).toBeCloseTo(64, 9);
  });
});
