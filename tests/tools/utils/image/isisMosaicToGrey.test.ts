import { describe, expect, it } from 'vitest';

import { isisMosaicToGrey } from '../../../../tools/utils/image/isisMosaicToGrey';
import { linearToSrgbByte } from '../../../../tools/utils/image/linearToSrgbByte';

const ALBEDO = 0.27;

describe('isisMosaicToGrey', () => {
  it('maps the mean to the albedo byte, zero to black, nodata to the albedo byte', () => {
    const data = new Float32Array([100, 200, 0, NaN]); // valid mean = 100
    const grey = isisMosaicToGrey(
      { data, width: 4, height: 1, leftLonDeg: -180, equatorialRadiusM: 1 },
      ALBEDO,
    );
    expect(grey.data[0]).toBe(linearToSrgbByte(ALBEDO));
    expect(grey.data[1]).toBe(linearToSrgbByte(2 * ALBEDO));
    expect(grey.data[2]).toBe(0);
    expect(grey.data[3]).toBe(linearToSrgbByte(ALBEDO));
  });

  it('clamps a hot pixel to 255 and a negative pixel to 0 without crushing the bulk', () => {
    const data = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) data[i] = 100 + (i % 100);
    data[0] = 1e6;
    data[2] = -50;
    const grey = isisMosaicToGrey(
      { data, width: 500, height: 2, leftLonDeg: -180, equatorialRadiusM: 1 },
      ALBEDO,
    );
    expect(grey.data[0]).toBe(255);
    expect(grey.data[2]).toBe(0);
    expect(grey.data[99]).toBeGreaterThan(grey.data[3]!);
    expect(grey.data[99]).toBeLessThan(255);
  });

  it('refuses a map whose left edge is not lon -180', () => {
    const data = new Float32Array(4).fill(1);
    expect(() =>
      isisMosaicToGrey({ data, width: 2, height: 2, leftLonDeg: 0, equatorialRadiusM: 1 }, ALBEDO),
    ).toThrow(/-180/);
  });
});
