import { describe, expect, it } from 'vitest';

import { TRAIL_CENTRES } from '../../../../../src/layers/missions/trails/data/trailCentres';

describe('TRAIL_CENTRES', () => {
  const ids = TRAIL_CENTRES.map((c) => c.id);

  it('holds the heliocentric planets, not moons', () => {
    expect(ids).toContain('jupiter');
    expect(ids).toContain('earth');
    expect(ids).not.toContain('moon');
  });

  it("reaches 1.5 Hill radii: Jupiter's is between 75 and 85 million km", () => {
    const reachKm = TRAIL_CENTRES.find((c) => c.id === 'jupiter')!.reachKm;
    expect(reachKm).toBeGreaterThan(75e6);
    expect(reachKm).toBeLessThan(85e6);
  });
});
