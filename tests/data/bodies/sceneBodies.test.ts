import { describe, it, expect } from 'vitest';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('SCENE_EARTH', () => {
  it('radius is 6371 km', () => {
    expect(SCENE_EARTH.radiusKm).toBe(6371);
  });

  it('is one AU from the Sun in Mpc', () => {
    // Position is authored in human units (1 AU) and stored as canonical Mpc.
    expect(SCENE_EARTH.positionMpc[0] as number).toBeCloseTo(SCALE_UNITS.AU_TO_MPC, 30);
    expect(SCENE_EARTH.positionMpc[1] as number).toBe(0);
    expect(SCENE_EARTH.positionMpc[2] as number).toBe(0);
  });

  it('textureUrl points at the Blue Marble asset', () => {
    expect(SCENE_EARTH.textureUrl).toBe('/images/earth/blue-marble-4k.jpg');
  });
});
