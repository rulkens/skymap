import { describe, it, expect } from 'vitest';

import { meanAlbedo } from '../../../tools/meshes/meanAlbedo';

describe('meanAlbedo()', () => {
  it('averages a synthetic image in linear light', () => {
    // 2x1 RGBA: one full red texel, one full blue texel. Both channels are at
    // the transfer curve's fixed points, so the mean is exactly half.
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);

    expect(meanAlbedo(pixels, 2, 1)).toEqual([0.5, 0, 0.5]);
  });

  it('undoes the sRGB transfer rather than averaging the encoded bytes', () => {
    // Mid-grey 128/255 is 0.216 in linear light, not 0.502 — a naive byte
    // average would hand the glint fallback a body twice as bright as its map.
    const [r, g, b] = meanAlbedo(new Uint8ClampedArray([128, 128, 128]), 1, 1);

    expect(r).toBeCloseTo(0.2159, 4);
    expect(g).toBeCloseTo(0.2159, 4);
    expect(b).toBeCloseTo(0.2159, 4);
  });
});
