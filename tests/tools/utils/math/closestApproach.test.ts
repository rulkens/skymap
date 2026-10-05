import { describe, expect, it } from 'vitest';

import { closestApproach } from '../../../../tools/utils/math/closestApproach';

describe('closestApproach', () => {
  it('finds the minimum of a synthetic flyby', () => {
    // Craft passes a body centre at 5000 km, 12 km/s, closest at 0.3 min past a sample.
    const n = 241; // 1-min samples over 4 h
    const t0 = 2444000.5;
    const tClosest = t0 + (120.3 * 60) / 86400;
    const rows = Array.from({ length: n }, (_, i) => {
      const jd = t0 + (i * 60) / 86400;
      return { jd, xKm: 12 * (jd - tClosest) * 86400, yKm: 5000, zKm: 0 };
    });

    const { jd, distanceKm } = closestApproach(rows);
    expect(Math.abs(jd - tClosest) * 1440).toBeLessThan(1); // minutes
    expect(distanceKm).toBeCloseTo(5000, 3);
  });
});
