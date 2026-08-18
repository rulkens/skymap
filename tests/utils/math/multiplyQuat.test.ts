import { describe, it, expect } from 'vitest';
import { multiplyQuat } from '../../../src/utils/math/multiplyQuat';
import { quatFromAxisAngle } from '../../../src/utils/math/quatFromAxisAngle';
import { rotateVec3ByQuat } from '../../../src/utils/math/rotateVec3ByQuat';

describe('multiplyQuat', () => {
  it('composes two 90° turns about Z into a rotation matching a hand-computed 180° turn', () => {
    const q90 = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    const composed = multiplyQuat(q90, q90);
    // 180° about Z: x' = -x, y' = -y — read off the rotation matrix directly,
    // independent of the quaternion formulas under test.
    const v = rotateVec3ByQuat(composed, [1, 0, 0]);
    expect(v[0]).toBeCloseTo(-1, 12);
    expect(v[1]).toBeCloseTo(0, 12);
    expect(v[2]).toBeCloseTo(0, 12);
  });
});
