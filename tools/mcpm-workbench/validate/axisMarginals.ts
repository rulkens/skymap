import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { TraceStats } from '../@types/TraceStats';

/**
 * axisMarginals — sum a flat cube down to one 1D profile per axis, in a
 * single O(N) pass. Layout matches the anchor's own indexing (spec Phase 3
 * header): `offset = z*Ny*Nx + y*Nx + x`, x fastest.
 */
export function axisMarginals(values: Float64Array, dims: Vec3): TraceStats['marginals'] {
  const [nx, ny, nz] = dims;
  if (values.length !== nx * ny * nz) {
    throw new Error(
      `axisMarginals: values.length ${values.length} does not match dims ${dims.join('x')} (expected ${nx * ny * nz})`,
    );
  }
  const mx = new Float64Array(nx);
  const my = new Float64Array(ny);
  const mz = new Float64Array(nz);
  for (let z = 0; z < nz; z++) {
    const zOff = z * ny * nx;
    for (let y = 0; y < ny; y++) {
      const rowOff = zOff + y * nx;
      for (let x = 0; x < nx; x++) {
        const v = values[rowOff + x]!;
        mx[x]! += v;
        my[y]! += v;
        mz[z]! += v;
      }
    }
  }
  return [mx, my, mz];
}
