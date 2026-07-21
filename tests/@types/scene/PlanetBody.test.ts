import { describe, it, expect, expectTypeOf } from 'vitest';

import type { PlanetBody } from '../../../src/@types/scene/PlanetBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('PlanetBody type', () => {
  it('accepts an object literal of the identity-only shape', () => {
    // Position + orientation are no longer on the record — they are derived per
    // sim-instant by `deriveBodyStates`, so the record carries identity alone.
    const mars: PlanetBody = {
      id: 'mars',
      label: 'Mars',
      radiusKm: 3389.5,
      albedo: [0.8, 0.4, 0.2],
    };
    expect(mars.radiusKm).toBe(3389.5);
  });

  it('types albedo as a Vec3', () => {
    expectTypeOf<PlanetBody['albedo']>().toEqualTypeOf<Vec3>();
  });
});
