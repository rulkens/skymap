/**
 * minFeasibleVoxelSizeMpc — the floor a manual voxel size can never go below
 * without an unallocatable grid. Every case checks the SAME per-buffer
 * arithmetic planGridBudget refuses with (bufferBytesForDims), so a floor
 * that "fits" here is a floor that actually builds.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { bufferBytesForDims } from '../../../../tools/mcpm-workbench/src/sim/planGridBudget';
import { minFeasibleVoxelSizeMpc } from '../../../../tools/mcpm-workbench/src/sim/minFeasibleVoxelSizeMpc';

const ceil8 = (n: number): number => Math.ceil(n / 8) * 8;
const dimsAt = (extent: Vec3, voxelSizeMpc: number): Vec3 => [
  ceil8(extent[0] / voxelSizeMpc),
  ceil8(extent[1] / voxelSizeMpc),
  ceil8(extent[2] / voxelSizeMpc),
];

describe('minFeasibleVoxelSizeMpc', () => {
  it('a 1500 Mpc cube at f32 against a 4 GiB limit floors at exactly 1500/1024 Mpc/vox', () => {
    // 1024^3 * 4 bytes = 4294967296 bytes = 4 GiB exactly, and 1024 is the largest
    // power-of-two-friendly ceil8'd dim reachable at this extent/limit pair — a
    // deliberately clean fixture so the expected floor has no rounding slack to hide behind.
    const extent: Vec3 = [1500, 1500, 1500];
    const limit = 4 * 1024 ** 3;
    const floor = minFeasibleVoxelSizeMpc(extent, 4, limit);
    expect(floor).toBeCloseTo(1500 / 1024, 9);
    expect(dimsAt(extent, floor)).toEqual([1024, 1024, 1024]);
    expect(bufferBytesForDims(dimsAt(extent, floor), 4)).toBe(limit);
  });

  it('applying the returned floor never exceeds maxBufferBytes, across ceil8-hostile extents', () => {
    const cases: { extent: Vec3; elementBytes: number; maxBufferBytes: number }[] = [
      // Wildly uneven axes: ceil8 rounding on the two short axes is proportionally huge.
      { extent: [977, 233, 41], elementBytes: 2, maxBufferBytes: 128 * 1024 ** 2 },
      { extent: [13, 4000, 777], elementBytes: 4, maxBufferBytes: 256 * 1024 ** 2 },
      // Near the 8-voxel-per-axis floor itself — almost no room for ceil8 to round into.
      { extent: [9, 9, 9], elementBytes: 4, maxBufferBytes: 2048 },
      // The real device limit from the repro that motivated this floor.
      { extent: [500, 500, 500], elementBytes: 4, maxBufferBytes: 4294967292 },
      // Two axes pinned to a sliver — the long axis alone must absorb the whole cut.
      { extent: [1, 1, 1000], elementBytes: 2, maxBufferBytes: 16 * 1024 ** 2 },
    ];

    for (const { extent, elementBytes, maxBufferBytes } of cases) {
      const floor = minFeasibleVoxelSizeMpc(extent, elementBytes, maxBufferBytes);
      const bytes = bufferBytesForDims(dimsAt(extent, floor), elementBytes);
      expect(bytes).toBeLessThanOrEqual(maxBufferBytes);
    }
  });
});
