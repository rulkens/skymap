import { describe, expect, it } from 'vitest';

import { resampleRgbaBilinear } from '../../../../tools/utils/image/resampleRgbaBilinear';

describe('resampleRgbaBilinear', () => {
  it('weights colour by alpha, so a transparent neighbour fades rather than darkens', () => {
    const rgba = new Uint8Array([200, 100, 50, 255, 0, 0, 0, 0]);

    const out = resampleRgbaBilinear({
      rgba,
      width: 2,
      height: 1,
      widthPx: 1,
      heightPx: 1,
      x0: 0.5,
      y0: 0,
      xStep: 1,
      yStep: 1,
    });

    expect([...out]).toEqual([200, 100, 50, 128]);
  });
});
