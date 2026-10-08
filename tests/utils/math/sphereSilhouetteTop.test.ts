import { describe, it, expect } from 'vitest';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { sphereSilhouetteTop } from '../../../src/utils/math/sphereSilhouetteTop';

describe('sphereSilhouetteTop', () => {
  it('lies on the sphere and the eye ray to it is tangent', () => {
    const toCentre: Vec3 = [3, -2, 8];
    const R = 2.5;
    const p = sphereSilhouetteTop(toCentre, R, [0.1, 1, 0.2], [0, 0, 0]);
    const rel: Vec3 = [p[0] - toCentre[0], p[1] - toCentre[1], p[2] - toCentre[2]];
    expect(Math.hypot(...rel)).toBeCloseTo(R, 10);
    expect(rel[0] * p[0] + rel[1] * p[1] + rel[2] * p[2]).toBeCloseTo(0, 10);
  });
});
