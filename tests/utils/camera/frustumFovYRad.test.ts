import { describe, it, expect } from 'vitest';
import { frustumFovYRad } from '../../../src/utils/camera/frustumFovYRad';
import { symmetricFrustum } from '../../../src/utils/camera/symmetricFrustum';

describe('frustumFovYRad', () => {
  it('round-trips a symmetric frustum built from a known fovY', () => {
    const fovYRad = 1.2;
    expect(frustumFovYRad(symmetricFrustum(fovYRad, 16 / 9))).toBeCloseTo(fovYRad, 12);
  });

  it('reads the same lens off a shifted window as off the centred one', () => {
    const shifted = { tanLeft: -0.3, tanRight: 0.6, tanDown: -0.4, tanUp: 0.5 };
    const centred = { tanLeft: -0.45, tanRight: 0.45, tanDown: -0.45, tanUp: 0.45 };
    expect(frustumFovYRad(shifted)).toBeCloseTo(frustumFovYRad(centred), 12);
  });
});
