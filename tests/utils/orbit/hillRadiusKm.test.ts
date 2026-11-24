import { describe, expect, it } from 'vitest';

import { PLANET_MASS_KG } from '../../../src/data/bodies/planetMassKg';
import { hillRadiusKm } from '../../../src/utils/orbit/hillRadiusKm';

describe('hillRadiusKm', () => {
  it("gives Jupiter's 53.1 million km", () => {
    const r = hillRadiusKm(778.479e6, PLANET_MASS_KG.jupiter);
    expect(Math.abs(r / 53.1e6 - 1)).toBeLessThan(0.01);
  });

  it("gives Earth's 1.50 million km", () => {
    const r = hillRadiusKm(149.598e6, PLANET_MASS_KG.earth);
    expect(Math.abs(r / 1.5e6 - 1)).toBeLessThan(0.01);
  });
});
