import { describe, it, expect } from 'vitest';
import { frustumFovYRad } from '../../../src/utils/camera/frustumFovYRad';
import { symmetricFrustum } from '../../../src/utils/camera/symmetricFrustum';

describe('frustumFovYRad', () => {
  it('round-trips a symmetric frustum built from a known fovY', () => {
    const fovYRad = 1.2;
    expect(frustumFovYRad(symmetricFrustum(fovYRad, 16 / 9))).toBeCloseTo(fovYRad, 12);
  });

  it('sums the up and down half-angles for an off-axis frustum', () => {
    const frustum = { tanLeft: -0.3, tanRight: 0.6, tanDown: -0.4, tanUp: 0.5 };
    expect(frustumFovYRad(frustum)).toBeCloseTo(Math.atan(0.5) + Math.atan(0.4), 12);
  });
});
