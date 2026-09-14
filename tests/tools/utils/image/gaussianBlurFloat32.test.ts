/**
 * The two properties the colour-transfer maths leans on: the kernel carries
 * all of its weight (a normalised convolution divides by a blur of the weight
 * plane, so a kernel summing to anything but 1 silently rescales nothing but
 * still misplaces energy), and it is isotropic about its centre.
 */

import { describe, expect, it } from 'vitest';

import { gaussianBlurFloat32 } from '../../../../tools/utils/image/gaussianBlurFloat32';

const SIDE = 65;
const CENTRE = 32;
const SIGMA = 3;

function blurredDelta(): Float32Array {
  const src = new Float32Array(SIDE * SIDE);
  src[CENTRE * SIDE + CENTRE] = 1;
  return gaussianBlurFloat32(src, SIDE, SIDE, SIGMA);
}

describe('gaussianBlurFloat32', () => {
  it('spreads a unit delta without gaining or losing weight', () => {
    // The plane is wider than the 3-sigma kernel either side of the delta, so
    // nothing falls off the zero-padded edge and the total must be exactly 1.
    const out = blurredDelta();
    let total = 0;
    for (const v of out) total += v;
    expect(total).toBeCloseTo(1, 5);
  });

  it('spreads it symmetrically in both axes', () => {
    const out = blurredDelta();
    const at = (x: number, y: number): number => out[y * SIDE + x]!;
    for (const d of [1, 4, 9]) {
      expect(at(CENTRE + d, CENTRE)).toBeCloseTo(at(CENTRE - d, CENTRE), 6);
      expect(at(CENTRE, CENTRE + d)).toBeCloseTo(at(CENTRE, CENTRE - d), 6);
      expect(at(CENTRE + d, CENTRE)).toBeCloseTo(at(CENTRE, CENTRE + d), 6);
    }
    // Falls off with distance — a flat or zero result would satisfy symmetry.
    expect(at(CENTRE, CENTRE)).toBeGreaterThan(at(CENTRE + 4, CENTRE));
    expect(at(CENTRE + 4, CENTRE)).toBeGreaterThan(at(CENTRE + 9, CENTRE));
  });
});
