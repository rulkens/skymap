import { describe, it, expect } from 'vitest';
import { quatFromAxisAngle } from '../../../src/utils/math/quatFromAxisAngle';

describe('quatFromAxisAngle', () => {
  it('returns the identity quaternion at angle 0', () => {
    const q = quatFromAxisAngle([0, 1, 0], 0);
    expect(q[0]).toBeCloseTo(0, 12);
    expect(q[1]).toBeCloseTo(0, 12);
    expect(q[2]).toBeCloseTo(0, 12);
    expect(q[3]).toBeCloseTo(1, 12);
  });

  it('matches the hand-computed quaternion for a 180° turn about Y', () => {
    // Half-angle 90°: sin(90°) = 1, cos(90°) = 0.
    const q = quatFromAxisAngle([0, 1, 0], Math.PI);
    expect(q[0]).toBeCloseTo(0, 12);
    expect(q[1]).toBeCloseTo(1, 12);
    expect(q[2]).toBeCloseTo(0, 12);
    expect(q[3]).toBeCloseTo(0, 12);
  });
});
