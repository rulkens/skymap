import { describe, it, expect } from 'vitest';
import { rotateVec3ByQuat } from '../../../src/utils/math/rotateVec3ByQuat';

describe('rotateVec3ByQuat', () => {
  it('is a no-op under the identity quaternion', () => {
    const v = rotateVec3ByQuat([0, 0, 0, 1], [1, 2, 3]);
    expect(v[0]).toBeCloseTo(1, 12);
    expect(v[1]).toBeCloseTo(2, 12);
    expect(v[2]).toBeCloseTo(3, 12);
  });

  it('rotates [1,0,0] by 90° about Z to [0,1,0]', () => {
    const s = Math.SQRT1_2;
    const v = rotateVec3ByQuat([0, 0, s, s], [1, 0, 0]);
    expect(v[0]).toBeCloseTo(0, 12);
    expect(v[1]).toBeCloseTo(1, 12);
    expect(v[2]).toBeCloseTo(0, 12);
  });

  it('rotates [0,1,0] by 90° about X to [0,0,1]', () => {
    const s = Math.SQRT1_2;
    const v = rotateVec3ByQuat([s, 0, 0, s], [0, 1, 0]);
    expect(v[0]).toBeCloseTo(0, 12);
    expect(v[1]).toBeCloseTo(0, 12);
    expect(v[2]).toBeCloseTo(1, 12);
  });

  it('rotates [0,0,1] by 90° about Y to [1,0,0]', () => {
    const s = Math.SQRT1_2;
    const v = rotateVec3ByQuat([0, s, 0, s], [0, 0, 1]);
    expect(v[0]).toBeCloseTo(1, 12);
    expect(v[1]).toBeCloseTo(0, 12);
    expect(v[2]).toBeCloseTo(0, 12);
  });
});
