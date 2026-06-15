import { describe, it, expect } from 'vitest';
import { sgToEq } from '../../../../tools/utils/math/sgToEq';
import { eqToSg } from '../../../../tools/utils/math/eqToSg';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('sgToEq', () => {
  it('inverts eqToSg', () => {
    const cases: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [7, -2, 5],
    ];
    for (const sg of cases) {
      const back = eqToSg(sgToEq(sg));
      expect(back[0]).toBeCloseTo(sg[0], 9);
      expect(back[1]).toBeCloseTo(sg[1], 9);
      expect(back[2]).toBeCloseTo(sg[2], 9);
    }
  });

  it('preserves vector length (rotation, not scale)', () => {
    const sg: Vec3 = [3, 4, 12]; // length 13
    const eq = sgToEq(sg);
    expect(Math.hypot(eq[0], eq[1], eq[2])).toBeCloseTo(13, 9);
  });
});
