import { describe, it, expect } from 'vitest';

import { cappedRotationToward } from '../../../src/utils/camera/cappedRotationToward';
import { rotateBasisByQuat } from '../../../src/utils/camera/rotateBasisByQuat';
import { quatFromAxisAngle } from '../../../src/utils/math/quatFromAxisAngle';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** right | up | forward — the nadir fixture basis the controller tests use. */
const BASE: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];
const AXIS: Vec3 = [0, 0.6, 0.8];

function angleBetweenBases(a: Mat3, b: Mat3): number {
  // trace(b·aᵀ) = 1 + 2cosθ; enough for an assertion, no axis needed.
  let tr = 0;
  for (let i = 0; i < 3; i += 1) {
    tr +=
      b[0 * 3 + i]! * a[0 * 3 + i]! + b[1 * 3 + i]! * a[1 * 3 + i]! + b[2 * 3 + i]! * a[2 * 3 + i]!;
  }
  return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
}

describe('cappedRotationToward', () => {
  it('recovers a below-cap rotation exactly and reaches the target', () => {
    const target = rotateBasisByQuat(quatFromAxisAngle(AXIS, 0.07), BASE);
    const q = cappedRotationToward(BASE, target, 0.1)!;
    const landed = rotateBasisByQuat(q, BASE);
    expect(angleBetweenBases(landed, target)).toBeLessThan(1e-9);
  });

  it('clamps an above-cap rotation to the cap, along the same geodesic', () => {
    const target = rotateBasisByQuat(quatFromAxisAngle(AXIS, 0.9), BASE);
    const q = cappedRotationToward(BASE, target, 0.1)!;
    const landed = rotateBasisByQuat(q, BASE);
    expect(angleBetweenBases(landed, BASE)).toBeCloseTo(0.1, 9);
    // On the geodesic: what remains is the residual 0.8, not a detour.
    expect(angleBetweenBases(landed, target)).toBeCloseTo(0.8, 9);
  });

  it('answers null for agreeing bases and stays finite at a π flip', () => {
    expect(cappedRotationToward(BASE, BASE, 0.1)).toBeNull();
    // θ = π about forward: the skew part vanishes; the diagonal fallback must
    // still yield a unit axis so the capped step is a real 0.1 rad turn.
    const flipped = rotateBasisByQuat(quatFromAxisAngle([0, 0, -1], Math.PI), BASE);
    const q = cappedRotationToward(BASE, flipped, 0.1)!;
    expect(q).not.toBeNull();
    const landed = rotateBasisByQuat(q, BASE);
    expect(angleBetweenBases(landed, BASE)).toBeCloseTo(0.1, 6);
    expect(angleBetweenBases(landed, flipped)).toBeCloseTo(Math.PI - 0.1, 6);
  });
});
