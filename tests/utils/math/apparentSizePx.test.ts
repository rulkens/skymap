import { describe, it, expect } from 'vitest';
import { apparentSizePx } from '../../../src/utils/math/apparentSizePx';

describe('apparentSizePx', () => {
  it('30 kpc galaxy at 10 Mpc, pxPerRad for a 60° fovY / 1080-px viewport ≈ 2.806 px', () => {
    // angular = 30 / (10*1000) = 0.003 rad
    // pxPerRad = 1080 / (2 · tan(30°)) = 1080 / (2 · 0.5774) ≈ 935.3
    // px = 0.003 · 935.3 ≈ 2.806
    const pxPerRad = 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2));
    const px = apparentSizePx({ diameterKpc: 30, distanceMpc: 10, pxPerRad });
    expect(px).toBeCloseTo(2.806, 2);
  });

  it('returns 0 for zero or negative distance (defensive)', () => {
    expect(apparentSizePx({ diameterKpc: 30, distanceMpc: 0, pxPerRad: 1000 })).toBe(0);
    expect(apparentSizePx({ diameterKpc: 30, distanceMpc: -5, pxPerRad: 1000 })).toBe(0);
  });
});
