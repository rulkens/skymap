import { describe, expect, it } from 'vitest';
import { packLogTraceVoxels } from '../../../src/utils/volume/packLogTraceVoxels';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * Independent of packLogTraceVoxels' own transpose — built from the
 * definitions in its header comment (C-order: axis 0 slowest, axis 2
 * fastest; x-fastest: axis 0 fastest) rather than copied from its loop, so
 * the test below can't pass by sharing a bug with the code it's checking.
 */
function toXFastestOrder(cOrder: Float32Array, dims: Vec3): Float32Array {
  const [nx, ny, nz] = dims;
  const out = new Float32Array(cOrder.length);
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        out[x + y * nx + z * nx * ny] = cOrder[x * ny * nz + y * nz + z]!;
      }
    }
  }
  return out;
}

describe('packLogTraceVoxels', () => {
  it("'x-fastest' on an already-transposed buffer matches the default C-order path on the same field", () => {
    // Non-cubic on purpose: a same-count cubic grid can't distinguish "right
    // values, wrong axis" from "right values, right axis".
    const dims: Vec3 = [2, 3, 4];
    const cOrderValues = Float32Array.from(
      { length: dims[0] * dims[1] * dims[2] },
      (_, i) => i * 3.5 + 1,
    );
    const xFastestValues = toXFastestOrder(cOrderValues, dims);

    const fromCOrder = packLogTraceVoxels(cOrderValues, dims);
    const fromXFastest = packLogTraceVoxels(xFastestValues, dims, 'x-fastest');

    expect(Array.from(fromXFastest.voxels)).toEqual(Array.from(fromCOrder.voxels));
    expect(fromXFastest.valueMin).toBe(fromCOrder.valueMin);
    expect(fromXFastest.valueMax).toBe(fromCOrder.valueMax);
  });
});
