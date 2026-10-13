import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { bodyVelocityKmS } from '../../../src/utils/orbit/bodyVelocityKmS';

describe('bodyVelocityKmS', () => {
  it('reads km/s off world positions in Mpc sampled in UT days', () => {
    // 30 km/s along x, -5 km/s along z: both unit conversions (Mpc→km, day→s) must be right.
    const at = (_id: string, simDays: number): Vec3 => {
      const s = simDays * 86_400;
      return [30 * s * SCALE_UNITS.KM_TO_MPC, 0, -5 * s * SCALE_UNITS.KM_TO_MPC];
    };
    const v = bodyVelocityKmS('earth', 10, at);
    expect(v[0]).toBeCloseTo(30, 6);
    expect(v[1]).toBe(0);
    expect(v[2]).toBeCloseTo(-5, 6);
  });
});
