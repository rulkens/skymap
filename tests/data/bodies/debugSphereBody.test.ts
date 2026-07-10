import { describe, it, expect } from 'vitest';
import { DEBUG_SPHERE_BODIES } from '../../../src/data/bodies/debugSphereBody';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('DEBUG_SPHERE_BODIES', () => {
  const sun = DEBUG_SPHERE_BODIES.find((b) => b.label === 'Sun');

  it('seeds the Sun at the render origin at true radius', () => {
    expect(sun).toBeDefined();
    // Radius: nominal solar radius 696 340 km → Mpc.
    expect(sun!.radiusMpc).toBeCloseTo(696_340 * SCALE_UNITS.KM_TO_MPC, 30);
    // The Sun sits at the render origin (the camera's focus point).
    expect(sun!.positionMpc[0] as number).toBe(0);
    expect(sun!.positionMpc[1] as number).toBe(0);
    expect(sun!.positionMpc[2] as number).toBe(0);
  });

  it('no longer carries the interim Earth stand-in (BodyStore + earthLayer own Earth)', () => {
    expect(DEBUG_SPHERE_BODIES.find((b) => b.label === 'Earth')).toBeUndefined();
  });
});
