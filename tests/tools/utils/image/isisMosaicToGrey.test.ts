import { describe, expect, it } from 'vitest';

import { isisMosaicToGrey } from '../../../../tools/utils/image/isisMosaicToGrey';
import { linearToSrgbByte } from '../../../../tools/utils/image/linearToSrgbByte';

const ALBEDO = 0.27;

describe('isisMosaicToGrey', () => {
  it('maps the mean to the albedo byte, zero to black, nodata to the albedo byte', () => {
    const data = new Float32Array([100, 200, 0, NaN]); // valid mean = 100
    const grey = isisMosaicToGrey(
      {
        data,
        width: 4,
        height: 1,
        leftLonDeg: -180,
        topLatDeg: 90,
        degPerPixel: 90,
        equatorialRadiusM: 1,
      },
      ALBEDO,
    );
    expect(grey.data[0]).toBe(linearToSrgbByte(ALBEDO));
    expect(grey.data[1]).toBe(linearToSrgbByte(2 * ALBEDO));
    expect(grey.data[2]).toBe(0);
    expect(grey.data[3]).toBe(linearToSrgbByte(ALBEDO));
  });

  it('refuses a map whose left edge is not lon -180', () => {
    const data = new Float32Array(4).fill(1);
    expect(() =>
      isisMosaicToGrey(
        {
          data,
          width: 2,
          height: 2,
          leftLonDeg: 0,
          topLatDeg: 90,
          degPerPixel: 90,
          equatorialRadiusM: 1,
        },
        ALBEDO,
      ),
    ).toThrow(/-180/);
  });
});
