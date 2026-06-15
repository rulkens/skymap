import { describe, it, expect } from 'vitest';
import { eqToSg } from '../../../../tools/utils/math/eqToSg';
import { sgToEq } from '../../../../tools/utils/math/sgToEq';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('eqToSg', () => {
  it('round-trips with sgToEq back to the input vector', () => {
    const cases: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [3, 4, 5],
      [-10, 20, -30],
    ];
    for (const eq of cases) {
      const sg = eqToSg(eq);
      const back = sgToEq(sg);
      expect(back[0]).toBeCloseTo(eq[0], 9);
      expect(back[1]).toBeCloseTo(eq[1], 9);
      expect(back[2]).toBeCloseTo(eq[2], 9);
    }
  });

  it('preserves vector length (rotation, not scale)', () => {
    const eq: Vec3 = [3, 4, 12]; // length 13
    const sg = eqToSg(eq);
    expect(Math.hypot(sg[0], sg[1], sg[2])).toBeCloseTo(13, 9);
  });
});
