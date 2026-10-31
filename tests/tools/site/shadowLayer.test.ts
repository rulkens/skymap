import { describe, expect, it } from 'vitest';

import { shadowLayer } from '../../../tools/site/utils/shadowLayer';

describe('shadowLayer', () => {
  it('unshadowed ground is white, whatever its colour', () => {
    const ground = Uint8Array.from([180, 90, 40, 255]);
    expect(Array.from(shadowLayer(ground, ground))).toEqual([255, 255, 255, 255]);
  });

  it('a shadow is the per-channel ratio, so multiplying it back onto the ground restores the frame', () => {
    const without = Uint8Array.from([200, 100, 50, 255]);
    const withShadow = Uint8Array.from([100, 50, 25, 255]);
    expect(Array.from(shadowLayer(withShadow, without))).toEqual([128, 128, 128, 255]);
  });

  it('black ground has nothing to darken and never divides by zero', () => {
    const black = Uint8Array.from([0, 0, 0, 255]);
    expect(Array.from(shadowLayer(black, black))).toEqual([255, 255, 255, 255]);
  });
});
