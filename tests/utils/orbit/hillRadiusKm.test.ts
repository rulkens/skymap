import { describe, expect, it } from 'vitest';

import { hillRadiusKm } from '../../../src/utils/orbit/hillRadiusKm';

describe('hillRadiusKm', () => {
  it("gives Jupiter's 53.1 million km", () => {
    const r = hillRadiusKm(778.479e6, 1.89813e27);
    expect(Math.abs(r / 53.1e6 - 1)).toBeLessThan(0.01);
  });

  it("gives Earth's 1.50 million km", () => {
    const r = hillRadiusKm(149.598e6, 5.9722e24);
    expect(Math.abs(r / 1.5e6 - 1)).toBeLessThan(0.01);
  });
});
