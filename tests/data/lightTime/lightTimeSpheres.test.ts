import { describe, it, expect } from 'vitest';
import { LIGHT_TIME_SPHERES } from '../../../src/data/lightTime/lightTimeSpheres';

describe('LIGHT_TIME_SPHERES', () => {
  it('radii strictly ascend and ids are unique', () => {
    const radii = LIGHT_TIME_SPHERES.map((s) => s.radiusMpc);
    expect(radii.every((r, i) => i === 0 || r > radii[i - 1]!)).toBe(true);
    expect(new Set(LIGHT_TIME_SPHERES.map((s) => s.id)).size).toBe(LIGHT_TIME_SPHERES.length);
  });

  it('the 1 light-second sphere has the physical radius', () => {
    const KM_PER_MPC = 3.0856775814913673e19;
    const second = LIGHT_TIME_SPHERES[0]!;
    expect(Math.abs(second.radiusMpc * KM_PER_MPC - 299_792.458)).toBeLessThan(1);
  });
});
