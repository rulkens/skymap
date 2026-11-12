import { describe, expect, it } from 'vitest';

import { asteroidClassFromOrbitType } from '../../../tools/asteroids/asteroidClassFromOrbitType';

describe('asteroidClassFromOrbitType', () => {
  it('maps each documented type', () => {
    const mapped = Array.from({ length: 11 }, (_, type) => asteroidClassFromOrbitType(type));
    expect(mapped).toEqual([
      'mainBelt', // 0 unclassified
      'nearEarth', // 1 Atira
      'nearEarth', // 2 Aten
      'nearEarth', // 3 Apollo
      'nearEarth', // 4 Amor
      'mainBelt', // 5 q < 1.665 AU
      'mainBelt', // 6 Hungaria
      'mainBelt', // 7 internal
      'hilda', // 8
      'jupiterTrojan', // 9
      'distant', // 10
    ]);
    expect(asteroidClassFromOrbitType(63)).toBe('mainBelt');
  });
});
