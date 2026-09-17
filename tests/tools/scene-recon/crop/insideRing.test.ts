import { describe, expect, it } from 'vitest';

import { insideRing } from '../../../../tools/scene-recon/crop/insideRing';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

describe('insideRing', () => {
  it('insideRing puts a point in a concave notch outside', () => {
    const u: Vec2[] = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ];
    expect(insideRing([1.5, 2], u)).toBe(false);
    expect(insideRing([0.5, 2], u)).toBe(true);
  });

  it('insideRing counts a ray through a corner once', () => {
    const diamond: Vec2[] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    expect(insideRing([0.5, 0], diamond)).toBe(true);
    expect(insideRing([-2, 0], diamond)).toBe(false);
  });
});
