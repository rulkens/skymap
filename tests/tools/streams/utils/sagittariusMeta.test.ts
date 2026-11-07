import { describe, expect, it } from 'vitest';

import type { VasilievStar } from '../../../../tools/streams/@types/VasilievStar';
import { sagittariusMeta } from '../../../../tools/streams/utils/sagittariusMeta';
import { sagittariusParticles } from '../../../../tools/streams/utils/sagittariusParticles';

const star = (distanceKpc: number, tStripGyr: number): VasilievStar => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 1,
  ra: 283.8,
  dec: -30.5,
  distanceKpc,
  tStripGyr,
});

describe('sagittariusMeta', () => {
  it('the extent ignores a single far outlier', () => {
    const stars = [
      ...Array.from({ length: 200 }, (_, i) => star(26 + (i % 5) * 0.1, i < 100 ? 0 : -1)),
      star(500, -2.5),
    ];
    const meta = sagittariusMeta(stars, sagittariusParticles(stars, 1n), null);
    expect(meta.lengthKpc).toBeGreaterThan(0);
    expect(meta.lengthKpc).toBeLessThan(2);
    expect(meta.distanceKpc[1]).toBeCloseTo(500, 3);
  });
});
