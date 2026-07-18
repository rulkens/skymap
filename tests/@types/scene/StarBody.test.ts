import { describe, it, expect, expectTypeOf } from 'vitest';

import type { StarBody } from '../../../src/@types/scene/StarBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('StarBody type', () => {
  it('accepts an object literal of the seeded shape', () => {
    const sun: StarBody = {
      id: 'sun',
      label: 'Sun',
      positionMpc: [0, 0, 0],
      absMag: 4.83,
      color: [1, 0.96, 0.9],
      radiusKm: 695700,
    };
    expect(sun.absMag).toBe(4.83);
  });

  it('types positionMpc as a Vec3', () => {
    expectTypeOf<StarBody['positionMpc']>().toEqualTypeOf<Vec3>();
  });
});
