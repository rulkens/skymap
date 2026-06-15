import { describe, it, expect } from 'vitest';
import { multiply3x3 } from '../../../src/utils/math/multiply3x3';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('multiply3x3', () => {
  it('is the identity when one operand is I', () => {
    const a: Mat3 = [2, 3, 5, 7, 11, 13, 17, 19, 23];
    expect(multiply3x3(a, IDENTITY)).toEqual(a);
    expect(multiply3x3(IDENTITY, a)).toEqual(a);
  });

  it('composes two 90° rotations about Z into a 180° rotation (column-major)', () => {
    // 90° about +Z, column-major: columns are images of the basis axes.
    // x→y, y→-x, z→z.
    const rz90: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const rz180 = multiply3x3(rz90, rz90);
    // 180° about Z: x→-x, y→-y, z→z.
    expect(rz180[0]).toBeCloseTo(-1, 12);
    expect(rz180[4]).toBeCloseTo(-1, 12);
    expect(rz180[8]).toBeCloseTo(1, 12);
  });

  it('matches the explicit column-major product formula', () => {
    const a: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const b: Mat3 = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    // result[c*3 + r] = Σ_k a[k*3 + r] · b[c*3 + k]
    const expected: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += a[k * 3 + r]! * b[c * 3 + k]!;
        expected[c * 3 + r] = s;
      }
    }
    expect(multiply3x3(a, b)).toEqual(expected);
  });
});
