import { describe, it, expect } from 'vitest';
import { matrixToQuaternion } from '../../../src/utils/math/matrixToQuaternion';
import type { Mat3 } from '../../../src/@types/math/Mat3';

describe('matrixToQuaternion', () => {
  it('maps the identity to the identity quaternion (0, 0, 0, 1)', () => {
    const q = matrixToQuaternion([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(q[0]).toBeCloseTo(0, 12);
    expect(q[1]).toBeCloseTo(0, 12);
    expect(q[2]).toBeCloseTo(0, 12);
    expect(q[3]).toBeCloseTo(1, 12);
  });

  it('returns a unit quaternion', () => {
    // 90° about +Z, column-major.
    const rz90: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const q = matrixToQuaternion(rz90);
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 12);
  });

  it('encodes a 90° rotation about +Z (negative-diagonal branch)', () => {
    const rz90: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const q = matrixToQuaternion(rz90);
    // q = (0, 0, sin(45°), cos(45°)) up to overall sign.
    const s = Math.SQRT1_2;
    const sign = q[3] < 0 ? -1 : 1;
    expect(sign * q[0]).toBeCloseTo(0, 6);
    expect(sign * q[1]).toBeCloseTo(0, 6);
    expect(Math.abs(q[2])).toBeCloseTo(s, 6);
    expect(Math.abs(q[3])).toBeCloseTo(s, 6);
  });

  it('encodes a 180° rotation about +X (m00-dominant branch)', () => {
    // 180° about X: x→x, y→-y, z→-z.
    const rx180: Mat3 = [1, 0, 0, 0, -1, 0, 0, 0, -1];
    const q = matrixToQuaternion(rx180);
    // Pure x quaternion (±1, 0, 0, 0).
    expect(Math.abs(q[0])).toBeCloseTo(1, 6);
    expect(q[1]).toBeCloseTo(0, 6);
    expect(q[2]).toBeCloseTo(0, 6);
    expect(q[3]).toBeCloseTo(0, 6);
  });
});
