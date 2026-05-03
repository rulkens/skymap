import { describe, it, expect } from 'vitest';
import { apparentSizePx } from '../../../src/utils/math/apparentSizePx';

describe('apparentSizePx', () => {
  it('30 kpc galaxy at 10 Mpc with 60° fovY and 1080-px viewport ≈ 2.806 px', () => {
    // angular = 30 / (10*1000) = 0.003 rad
    // pxPerRad = 1080 / (2 · tan(30°)) = 1080 / (2 · 0.5774) ≈ 935.3
    // px = 0.003 · 935.3 ≈ 2.806
    const px = apparentSizePx({
      diameterKpc: 30,
      distanceMpc: 10,
      viewportHeightPx: 1080,
      fovYRad: (60 * Math.PI) / 180,
    });
    expect(px).toBeCloseTo(2.806, 2);
  });

  it('returns 0 for zero or negative distance (defensive)', () => {
    expect(
      apparentSizePx({ diameterKpc: 30, distanceMpc: 0, viewportHeightPx: 1080, fovYRad: 1 }),
    ).toBe(0);
    expect(
      apparentSizePx({ diameterKpc: 30, distanceMpc: -5, viewportHeightPx: 1080, fovYRad: 1 }),
    ).toBe(0);
  });

  it('scales linearly with viewport height', () => {
    const small = apparentSizePx({
      diameterKpc: 30,
      distanceMpc: 5,
      viewportHeightPx: 540,
      fovYRad: 1,
    });
    const big = apparentSizePx({
      diameterKpc: 30,
      distanceMpc: 5,
      viewportHeightPx: 1080,
      fovYRad: 1,
    });
    expect(big).toBeCloseTo(small * 2, 6);
  });
});
