import { describe, expect, it } from 'vitest';
import { boxBasisVectors } from '../../../../tools/mcpm-workbench/src/field/boxBasisVectors';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';

const dot = (a: readonly number[], b: readonly number[]): number =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

describe('boxBasisVectors', () => {
  it('at identity rotation returns the unit axes', () => {
    const { x, y, z } = boxBasisVectors([0, 0, 0, 1]);
    expect(x).toEqual([1, 0, 0]);
    expect(y).toEqual([0, 1, 0]);
    expect(z).toEqual([0, 0, 1]);
  });

  it('at a 90°-about-Y rotation matches a hand-computed triplet', () => {
    // +90° about Y rotates (x,y,z) -> (z, y, -x) (worldToBoxLocal.test.ts's own worked
    // formula, applied here without the conjugate): x-axis [1,0,0] -> [0,0,-1], y-axis
    // [0,1,0] is on-axis so it's unchanged, z-axis [0,0,1] -> [1,0,0].
    const rotation = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
    const { x, y, z } = boxBasisVectors(rotation);

    expect(x[0]).toBeCloseTo(0, 10);
    expect(x[1]).toBeCloseTo(0, 10);
    expect(x[2]).toBeCloseTo(-1, 10);

    expect(y[0]).toBeCloseTo(0, 10);
    expect(y[1]).toBeCloseTo(1, 10);
    expect(y[2]).toBeCloseTo(0, 10);

    expect(z[0]).toBeCloseTo(1, 10);
    expect(z[1]).toBeCloseTo(0, 10);
    expect(z[2]).toBeCloseTo(0, 10);

    for (const v of [x, y, z]) {
      expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 10);
    }
    expect(dot(x, y)).toBeCloseTo(0, 10);
    expect(dot(x, z)).toBeCloseTo(0, 10);
    expect(dot(y, z)).toBeCloseTo(0, 10);
  });
});
