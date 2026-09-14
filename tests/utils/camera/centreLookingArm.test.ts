import { describe, it, expect } from 'vitest';

import { centreLookingArm } from '../../../src/utils/camera/centreLookingArm';
import { eyeMpcOf } from '../../../src/utils/camera/eyeMpcOf';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('centreLookingArm', () => {
  it('keeps the eye and aims at the centre', () => {
    // pop-2 regression in one assertion: an implementation that ranges to the
    // body's surface instead of its centre moves the eye by one body radius.
    const eyeMpc: Vec3 = [10, 2, -4];
    const centreMpc: Vec3 = [3, 6, 1];
    const out = centreLookingArm(eyeMpc, centreMpc, IDENTITY, 0);
    if (out.frame !== 'absolute') throw new Error('expected the absolute arm');
    expect(out.pose.target).toEqual(centreMpc);
    const dx = centreMpc[0] - eyeMpc[0];
    const dy = centreMpc[1] - eyeMpc[1];
    const dz = centreMpc[2] - eyeMpc[2];
    const expectedDistance = Math.hypot(dx, dy, dz);
    expect(out.pose.distance).toBeCloseTo(expectedDistance, 10);
    // target + dir·distance must reproduce the input eye exactly.
    const rebuiltEye = eyeMpcOf(out.pose, IDENTITY);
    expect(rebuiltEye[0]).toBeCloseTo(eyeMpc[0], 10);
    expect(rebuiltEye[1]).toBeCloseTo(eyeMpc[1], 10);
    expect(rebuiltEye[2]).toBeCloseTo(eyeMpc[2], 10);
  });

  it('carries the incoming roll', () => {
    const out = centreLookingArm([1, 0, 0], [0, 0, 0], IDENTITY, 0.42);
    if (out.frame !== 'absolute') throw new Error('expected the absolute arm');
    expect(out.pose.roll).toBe(0.42);
  });
});
