import { describe, expect, it } from 'vitest';

import { starRadiusSolar } from '../../../src/utils/astro/starRadiusSolar';

// R/R☉ = √(L/L☉)·(5772/T)². Ground truth computed independently from the
// Stefan–Boltzmann relation — asserts the √L and (T☉/T)² factors are wired the
// right way round (a swapped ratio would grow, not shrink, radius with T).
describe('starRadiusSolar', () => {
  it('reads about one solar radius for a Sun-like star', () => {
    expect(starRadiusSolar(1.0153, 5683.94)).toBeCloseTo(1.0391, 3);
  });

  it('reads about ten solar radii for a cool, luminous red giant', () => {
    expect(starRadiusSolar(46.394, 4720.95)).toBeCloseTo(10.182, 2);
  });
});
