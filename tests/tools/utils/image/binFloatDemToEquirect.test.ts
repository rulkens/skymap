import { describe, expect, it } from 'vitest';

import { binFloatDemToEquirect } from '../../../../tools/utils/image/binFloatDemToEquirect';

// 8 columns = 45 deg each; raster column 0 is lon 0..45, texture centre column is lon 0.
const W = 8;
const spike = Float32Array.from([10, 0, 0, 0, 0, 0, 0, 0]);

describe('binFloatDemToEquirect', () => {
  it('rolls raster lon 0 to the centre column', () => {
    const out = binFloatDemToEquirect(spike, 1, W, 1, W, 1, 0);
    expect(out.indexOf(10)).toBe(W / 2);
  });

  it('positive lonOffsetDeg moves raster features WEST in the texture (texture reads raster at lon + offset)', () => {
    const out = binFloatDemToEquirect(spike, 1, W, 1, W, 1, 90);
    expect(out.indexOf(10)).toBe(W / 2 - 2);
  });

  it('averages valid samples per cell and leaves cells with only nodata as NaN', () => {
    const src = Float32Array.from([2, 4, -3.4e38, -3.4e38]);
    const out = binFloatDemToEquirect(src, 1, 4, 1, 2, 1, 0);
    // bins: [2,4] -> cell 0 -> rolled to col 1; nodata pair -> cell 1 -> col 0
    expect(out[1]).toBe(3);
    expect(out[0]).toBeNaN();
  });
});
