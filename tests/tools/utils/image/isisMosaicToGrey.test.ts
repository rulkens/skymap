import { describe, expect, it } from 'vitest';

import { isisMosaicToGrey } from '../../../../tools/utils/image/isisMosaicToGrey';

describe('isisMosaicToGrey', () => {
  it('fills nodata with the mean grey and clips hot pixels instead of crushing the bulk', () => {
    const data = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) data[i] = 100 + (i % 100); // 100..199 bulk
    data[0] = 1e6; // hot pixel
    data[1] = NaN;
    const grey = isisMosaicToGrey({ data, width: 500, height: 2, leftLonDeg: -180 });
    expect(grey.data[0]).toBe(255);
    expect(grey.data[1]).toBeGreaterThan(110);
    expect(grey.data[1]).toBeLessThan(145);
    expect(Math.min(...grey.data)).toBe(0);
    expect(grey.data[99]).toBeGreaterThan(240); // bulk top is near full scale, not ~0
  });

  it('refuses a map whose left edge is not lon -180', () => {
    const data = new Float32Array(4).fill(1);
    expect(() => isisMosaicToGrey({ data, width: 2, height: 2, leftLonDeg: 0 })).toThrow(/-180/);
  });
});
