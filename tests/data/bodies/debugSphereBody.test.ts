import { describe, it, expect } from 'vitest';
import { DEBUG_SPHERE_BODY } from '../../../src/data/bodies/debugSphereBody';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('DEBUG_SPHERE_BODY', () => {
  it('DEBUG_SPHERE_BODY is Earth-sized at 1 AU', () => {
    // Radius: IAU nominal Earth radius 6371 km → Mpc.
    const expectedRadiusMpc = 6371 * SCALE_UNITS.KM_TO_MPC;
    expect(DEBUG_SPHERE_BODY.radiusMpc).toBeCloseTo(expectedRadiusMpc, 30);

    // Position: 1 AU along the +X axis from the render origin (the Sun).
    const expectedXMpc = SCALE_UNITS.AU_TO_MPC;
    expect(DEBUG_SPHERE_BODY.positionMpc[0] as number).toBeCloseTo(expectedXMpc, 30);
    expect(DEBUG_SPHERE_BODY.positionMpc[1] as number).toBe(0);
    expect(DEBUG_SPHERE_BODY.positionMpc[2] as number).toBe(0);
  });
});
