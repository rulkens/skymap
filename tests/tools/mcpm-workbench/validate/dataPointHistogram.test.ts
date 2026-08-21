/**
 * Pins the origin/voxel-size → voxel-index mapping dataPointHistogram
 * shares with compareTraceCubes's --meta path: a mis-parsed origin or
 * voxel size would silently shift every point into the wrong voxel
 * without ever throwing, so this nails down one point at a known world
 * position landing in the hand-computed voxel and histogram bin.
 */
import { describe, expect, it } from 'vitest';
import { dataPointHistogram } from '../../../../tools/mcpm-workbench/validate/dataPointHistogram';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('dataPointHistogram', () => {
  it('samples one data point into its hand-computed voxel and bin', () => {
    // 2x2x2 cube, x-fastest: offset = z*4 + y*2 + x. Only voxel (x=1,y=0,z=0)
    // — offset 1 — is non-zero, set to e-1 so log1p(trace) = ln(e) = 1 exactly.
    const dims: Vec3 = [2, 2, 2];
    const values = new Float64Array(8);
    values[1] = Math.E - 1;

    const originMpc: Vec3 = [0, 0, 0];
    const voxelSizeMpc: Vec3 = [1, 1, 1];
    // World (1.5, 0.5, 0.5) -> voxel index floor((p-origin)/voxelSize) = (1, 0, 0),
    // i.e. offset 1 — the hot voxel above.
    const pointsMpc = new Float32Array([1.5, 0.5, 0.5]);

    // binCount=4 over maxLogTrace=2 -> binWidth=0.5; logV=1 -> bin floor(1/0.5)=2.
    const { histogram, meanLogTrace } = dataPointHistogram({
      values,
      dims,
      originMpc,
      voxelSizeMpc,
      pointsMpc,
      pointCount: 1,
      binCount: 4,
      maxLogTrace: 2,
    });

    expect(Array.from(histogram)).toEqual([0, 0, 1, 0]);
    expect(meanLogTrace).toBeCloseTo(1, 10);
  });

  it('skips a point that falls outside the grid and reports NaN when none land', () => {
    const dims: Vec3 = [2, 2, 2];
    const values = new Float64Array(8);
    const originMpc: Vec3 = [0, 0, 0];
    const voxelSizeMpc: Vec3 = [1, 1, 1];
    const pointsMpc = new Float32Array([100, 100, 100]); // far outside [0,2)^3

    const { histogram, meanLogTrace } = dataPointHistogram({
      values,
      dims,
      originMpc,
      voxelSizeMpc,
      pointsMpc,
      pointCount: 1,
      binCount: 4,
      maxLogTrace: 2,
    });

    expect(Array.from(histogram)).toEqual([0, 0, 0, 0]);
    expect(Number.isNaN(meanLogTrace)).toBe(true);
  });
});
