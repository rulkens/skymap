import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { bufferBytesForDims } from './planGridBudget';

const ceil8 = (n: number): number => Math.ceil(n / 8) * 8;

function dimsAt(extentMpc: Readonly<Vec3>, voxelSizeMpc: number): Vec3 {
  return [
    ceil8(extentMpc[0] / voxelSizeMpc),
    ceil8(extentMpc[1] / voxelSizeMpc),
    ceil8(extentMpc[2] / voxelSizeMpc),
  ];
}

function fits(
  extentMpc: Readonly<Vec3>,
  voxelSizeMpc: number,
  elementBytes: number,
  maxBufferBytes: number,
): boolean {
  return bufferBytesForDims(dimsAt(extentMpc, voxelSizeMpc), elementBytes) <= maxBufferBytes;
}

// 60 halvings of the search interval is far past f64 precision for any Mpc-scale
// extent — plenty to converge, never enough to matter for the loop's cost.
const BISECTION_ITERATIONS = 60;
// A voxel size this large clamps every axis to ceil8's floor of 8 voxels; guards
// the growth loop below against a maxBufferBytes so small that even that 8-voxel
// floor doesn't fit (no realistic device limit is that small for f16/f32 grids).
const GROWTH_ITERATIONS = 64;

/**
 * minFeasibleVoxelSizeMpc — the smallest voxel size (Mpc) whose ceil8'd grid
 * dims keep ONE grid buffer (depositA/depositB/trace — planGridBudget.ts's
 * `bufferBytesForDims`, the term that actually refuses) within
 * `maxBufferBytes`. Bisects rather than solving a closed form: ceil8 makes
 * feasibility a staircase in voxel size, but a strictly non-increasing one
 * (a bigger voxel never grows any axis's dim), so bisection needs no ad hoc
 * pad to stay conservative — it only ever narrows toward a value it has
 * already confirmed fits, and returns that value, never an unverified guess.
 */
export function minFeasibleVoxelSizeMpc(
  extentMpc: Readonly<Vec3>,
  elementBytes: number,
  maxBufferBytes: number,
): number {
  let hi = Math.max(extentMpc[0], extentMpc[1], extentMpc[2], 1) / 8;
  for (
    let i = 0;
    i < GROWTH_ITERATIONS && !fits(extentMpc, hi, elementBytes, maxBufferBytes);
    i++
  ) {
    hi *= 2;
  }
  let lo = 0;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (fits(extentMpc, mid, elementBytes, maxBufferBytes)) hi = mid;
    else lo = mid;
  }
  return hi; // invariant maintained throughout: `hi` always fits
}
