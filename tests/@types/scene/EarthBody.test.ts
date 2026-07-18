import { describe, it, expect, expectTypeOf } from 'vitest';

import type { EarthBody } from '../../../src/@types/scene/EarthBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('EarthBody type', () => {
  it('accepts an object literal of the seeded shape', () => {
    const earth: EarthBody = {
      id: 'earth',
      label: 'Earth',
      positionMpc: [0, 0, 0],
      radiusKm: 6371,
      orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    };
    expect(earth.radiusKm).toBe(6371);
  });

  it('types positionMpc as a Vec3', () => {
    expectTypeOf<EarthBody['positionMpc']>().toEqualTypeOf<Vec3>();
  });
});
