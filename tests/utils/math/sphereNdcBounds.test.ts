import { describe, it, expect } from 'vitest';
import { sphereNdcBounds } from '../../../src/utils/math/sphereNdcBounds';

describe('sphereNdcBounds', () => {
  it('centred sphere at 3 radii spans ±tan(asin(1/3))/tanHalf plus the pad', () => {
    const [lo, hi] = sphereNdcBounds(0, 3, 1, 0.5, 0.01);
    const half = Math.tan(Math.asin(1 / 3)) / 0.5 + 0.01;
    expect(hi).toBeCloseTo(half, 10);
    expect(lo).toBeCloseTo(-half, 10);
  });

  it('off-axis sphere (centre 3, depth 4, R 1, tanHalf 2, pad 0) spans [0.2367, 0.5633]', () => {
    const [lo, hi] = sphereNdcBounds(3, 4, 1, 2, 0);
    expect(lo).toBeCloseTo(0.2367, 4);
    expect(hi).toBeCloseTo(0.5633, 4);
  });

  it('returns the full range when the eye is inside or the sphere reaches the eye plane', () => {
    expect(sphereNdcBounds(0.2, 0.3, 1, 1, 0)).toEqual([-1, 1]);
    expect(sphereNdcBounds(2, 1, 1.5, 1, 0)).toEqual([-1, 1]);
  });
});
