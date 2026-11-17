import { describe, expect, it } from 'vitest';

import { asteroidDiameterKmFromH } from '../../../src/utils/photometry/asteroidDiameterKmFromH';

describe('asteroidDiameterKmFromH', () => {
  it('gives the textbook 1 km at H 17.75 and albedo 0.14 (the NEO survey threshold)', () => {
    expect(asteroidDiameterKmFromH(17.75, 0.14)).toBeCloseTo(1.0, 2);
  });

  it('is bigger for a darker surface and halves every 1.5 magnitudes', () => {
    expect(asteroidDiameterKmFromH(10, 0.05) / asteroidDiameterKmFromH(10, 0.25)).toBeCloseTo(
      Math.sqrt(5),
      10,
    );
    expect(asteroidDiameterKmFromH(11.505, 0.1) / asteroidDiameterKmFromH(10, 0.1)).toBeCloseTo(
      0.5,
      3,
    );
  });
});
