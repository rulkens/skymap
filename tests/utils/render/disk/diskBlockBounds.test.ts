import { describe, expect, it } from 'vitest';

import { diskBlockBounds } from '../../../../src/utils/render/disk/diskBlockBounds';

describe('diskBlockBounds', () => {
  it("boxes the galaxies and keeps the largest diameter, leaving a blob's NaN row out", () => {
    const block = {
      count: 3,
      positions: Float32Array.of(1, -2, 3, NaN, NaN, NaN, -4, 5, 0),
      // The blob's diameter is larger than either galaxy's: it must not count.
      diameterKpc: Float32Array.of(30, 500, 70),
    };
    expect(diskBlockBounds(block)).toEqual({
      minX: -4,
      minY: -2,
      minZ: 0,
      maxX: 1,
      maxY: 5,
      maxZ: 3,
      maxDiameterKpc: 70,
    });
  });
});
