import { describe, it, expect } from 'vitest';
import { opticalCentrePx } from '../../../src/utils/camera/opticalCentrePx';
import { symmetricFrustum } from '../../../src/utils/camera/symmetricFrustum';

describe('opticalCentrePx', () => {
  it('is the canvas centre for a symmetric frustum', () => {
    const [x, y] = opticalCentrePx(symmetricFrustum(1, 16 / 9), [1600, 900]);
    expect(x).toBeCloseTo(800, 9);
    expect(y).toBeCloseTo(450, 9);
  });

  it('follows a shifted window', () => {
    const shifted = { tanLeft: -1, tanRight: 3, tanDown: -1, tanUp: 1 };
    expect(opticalCentrePx(shifted, [400, 200])).toEqual([100, 100]);
  });
});
