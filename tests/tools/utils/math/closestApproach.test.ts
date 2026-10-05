import { describe, expect, it } from 'vitest';

import { closestApproach } from '../../../../tools/utils/math/closestApproach';

describe('closestApproach', () => {
  it('finds the minimum of a synthetic flyby', () => {
    // Craft passes a stationary target at 5000 km, 12 km/s, closest at 0.3 min past a sample.
    const n = 241; // 1-min samples over 4 h
    const t0 = 2444000.5;
    const tClosest = t0 + (120.3 * 60) / 86400;
    const craftT = Float64Array.from({ length: n }, (_, i) => t0 + (i * 60) / 86400);
    const craftPos = new Float64Array(3 * n);
    for (let i = 0; i < n; i++)
      craftPos.set([12 * (craftT[i]! - tClosest) * 86400, 5000, 0], 3 * i);
    const target = { t: Float64Array.of(t0 - 1, t0 + 1), pos: new Float64Array(6) };

    const { jd, distanceKm } = closestApproach({ t: craftT, pos: craftPos }, target);
    expect(Math.abs(jd - tClosest) * 1440).toBeLessThan(1); // minutes
    expect(distanceKm).toBeCloseTo(5000, 3);
  });
});
