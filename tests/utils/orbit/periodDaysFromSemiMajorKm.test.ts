import { describe, it, expect } from 'vitest';
import { periodDaysFromSemiMajorKm } from '../../../src/utils/orbit/periodDaysFromSemiMajorKm';

describe('periodDaysFromSemiMajorKm', () => {
  it('matches a known LEO period', () => {
    // Independent, textbook check (not a formula mirror): the ISS orbits at
    // ~400 km altitude with a well-known ~92.68-minute period. Earth's radius
    // (6371 km) + 400 km gives the same semi-major axis the whale/petunias
    // rows use. A wrong GM, a dropped 2π, or a unit slip would miss this by
    // far more than the ~0.3-minute gap already present from J2/drag effects
    // this two-body formula doesn't model.
    const semiMajorKm = 6371 + 400;
    const periodMinutes = periodDaysFromSemiMajorKm(semiMajorKm) * 24 * 60;
    expect(periodMinutes).toBeCloseTo(92.68, 0);
  });
});
