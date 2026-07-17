import { describe, it, expect, expectTypeOf } from 'vitest';

import type { PlanetBody } from '../../../src/@types/scene/PlanetBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('PlanetBody type', () => {
  it('accepts an object literal of the seeded shape', () => {
    const mars: PlanetBody = {
      id: 'mars',
      label: 'Mars',
      positionMpc: [0, 0, 0],
      radiusKm: 3389.5,
      albedo: [0.8, 0.4, 0.2],
      orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    };
    expect(mars.radiusKm).toBe(3389.5);
  });

  it('types positionMpc as a Vec3', () => {
    expectTypeOf<PlanetBody['positionMpc']>().toEqualTypeOf<Vec3>();
  });
});
