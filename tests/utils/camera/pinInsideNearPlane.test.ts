/**
 * pinInsideNearPlane — the NEAR0 overlay's near-plane rescue. One clip z/w
 * serves all six vertices of a ring quad, so a centre inside the near plane
 * discards the whole primitive rather than clipping it.
 */

import { describe, it, expect } from 'vitest';

import { pinInsideNearPlane } from '../../../src/utils/camera/pinInsideNearPlane';

// Column-major vp whose clip `w` is the camera-relative z (row 4 = [0,0,1,0]).
const W_IS_Z = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0]);

describe('pinInsideNearPlane', () => {
  it('leaves a centre already beyond the near plane untouched', () => {
    expect(pinInsideNearPlane([0, 0, 10], W_IS_Z, 5)).toEqual([0, 0, 10]);
  });

  it('tests depth, not distance — an off-axis centre farther away than the plane still pins', () => {
    // |centre| = 6.32 > 5, but its clip w is 2, so it sits inside the plane and
    // must be pushed out; a length-based test would have left it to be clipped.
    const [x, y, z] = pinInsideNearPlane([6, 0, 2], W_IS_Z, 5);
    expect(x).toBeCloseTo(15.015, 11);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(5.005, 12);
  });

  it('leaves a centre behind the eye alone rather than folding it into view', () => {
    expect(pinInsideNearPlane([0, 0, -3], W_IS_Z, 5)).toEqual([0, 0, -3]);
  });
});
