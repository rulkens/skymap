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

  it('composes a 90° X-turn with a 90° Y-turn in a non-commuting order, matching two sequential rotations', () => {
    const qX = quatFromAxisAngle([1, 0, 0], Math.PI / 2);
    const qY = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
    // multiplyQuat(qX, qY) means "apply qY, then qX" per the module contract.
    const composed = multiplyQuat(qX, qY);

    // Hand trace, starting from v = [0, 1, 0]:
    //  1. Apply qY (90° about Y) — v already lies on the Y axis, the axis of
    //     rotation, so it is left unchanged: [0, 1, 0] -> [0, 1, 0].
    //  2. Apply qX (90° about X) — this rotates the Y axis toward the Z axis
    //     (right-hand rule about +X): [0, 1, 0] -> [0, 0, 1].
    // Expected result: [0, 0, 1].
    //
    // Swap the product's argument order (Y∘X = apply qX, then qY) and the
    // same v traces to [1, 0, 0] instead — a different vector — so this case
    // does catch an argument-order bug, unlike the same-axis test above.
    const v: [number, number, number] = [0, 1, 0];
    const composedResult = rotateVec3ByQuat(composed, v);
    const sequentialResult = rotateVec3ByQuat(qX, rotateVec3ByQuat(qY, v));

    expect(composedResult[0]).toBeCloseTo(0, 12);
    expect(composedResult[1]).toBeCloseTo(0, 12);
    expect(composedResult[2]).toBeCloseTo(1, 12);
    expect(composedResult[0]).toBeCloseTo(sequentialResult[0], 12);
    expect(composedResult[1]).toBeCloseTo(sequentialResult[1], 12);
    expect(composedResult[2]).toBeCloseTo(sequentialResult[2], 12);
  });
});
