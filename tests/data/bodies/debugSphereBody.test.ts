import { describe, it, expect } from 'vitest';
import { DEBUG_SPHERE_BODIES } from '../../../src/data/bodies/debugSphereBody';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('DEBUG_SPHERE_BODIES', () => {
  const sun = DEBUG_SPHERE_BODIES.find((b) => b.label === 'Sun');
  const earth = DEBUG_SPHERE_BODIES.find((b) => b.label === 'Earth');

  it('seeds the Sun at the render origin at true radius', () => {
    expect(sun).toBeDefined();
    // Radius: nominal solar radius 696 340 km → Mpc.
    expect(sun!.radiusMpc).toBeCloseTo(696_340 * SCALE_UNITS.KM_TO_MPC, 30);
    // The Sun sits at the render origin (the camera's focus point).
    expect(sun!.positionMpc[0] as number).toBe(0);
    expect(sun!.positionMpc[1] as number).toBe(0);
    expect(sun!.positionMpc[2] as number).toBe(0);
  });

  it('seeds Earth Earth-sized at 1 AU', () => {
    expect(earth).toBeDefined();
    // Radius: IAU nominal Earth radius 6371 km → Mpc.
    expect(earth!.radiusMpc).toBeCloseTo(6371 * SCALE_UNITS.KM_TO_MPC, 30);
    // Position: 1 AU along the +X axis from the render origin (the Sun).
    expect(earth!.positionMpc[0] as number).toBeCloseTo(SCALE_UNITS.AU_TO_MPC, 30);
    expect(earth!.positionMpc[1] as number).toBe(0);
    expect(earth!.positionMpc[2] as number).toBe(0);
  });

  it('the Sun is far larger than Earth (scale reference)', () => {
    expect(sun!.radiusMpc).toBeGreaterThan(earth!.radiusMpc * 100);
  });
});
