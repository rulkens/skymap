import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * cOrderToXFastest — the inverse of `xFastestToCOrder` / `packLogTraceVoxels`'s C-order
 * branch: given a flat array in NumPy C-order (`dims[2]` fastest) for shape `dims`, produce
 * the x-fastest layout (`offset = z*ny*nx + y*nx + x`) `axisMarginals`/`dataPointHistogram`
 * require. NOT the same operation as calling `xFastestToCOrder` again on its own output —
 * that only self-inverts when `dims[0] === dims[2]`, which is exactly the coincidence that
 * let X1's transposed comparison run (see docs/superpowers/sdd/2026-08-18-mcpm-workbench/
 * final-review.md §A/X1) without ever hitting an out-of-bounds index.
 */
export function cOrderToXFastest<T extends Float32Array | Float64Array>(values: T, dims: Vec3): T {
  const [nx, ny, nz] = dims;
  const Ctor = values.constructor as new (length: number) => T;
  const out = new Ctor(values.length);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const srcIdx = i * ny * nz + j * nz + k; // C-order
        const dstIdx = k * ny * nx + j * nx + i; // x-fastest
        out[dstIdx] = values[srcIdx]!;
      }
    }
  }
  return out;
}
