import { describe, expect, it } from 'vitest';

import { linearToSrgb } from '../../../../tools/utils/color/linearToSrgb';
import { srgbToLinear } from '../../../../tools/utils/color/srgbToLinear';

describe('linearToSrgb', () => {
  it('maps the endpoints exactly', () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1, 9);
  });

  it('round-trips every one of the 256 byte levels through srgbToLinear', () => {
    for (let byte = 0; byte < 256; byte++) {
      const back = Math.round(linearToSrgb(srgbToLinear(byte / 255)) * 255);
      expect(back).toBe(byte);
    }
  });
});
