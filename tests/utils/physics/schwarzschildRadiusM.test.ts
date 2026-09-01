import { describe, it, expect } from 'vitest';

import { schwarzschildRadiusM } from '../../../src/utils/physics/schwarzschildRadiusM';
import { SGR_A_STAR_MASS_SOLAR } from '../../../src/data/bodies/sgrAStarMassSolar';

describe('schwarzschildRadiusM', () => {
  it('computes Sgr A* Schwarzschild radius within float tolerance', () => {
    // r_s = 2GM/c² for M = 4.297 × 10⁶ M☉ ≈ 1.2693 × 10¹⁰ m.
    // Hand-computed reference value, not a re-derivation of the same formula.
    const expectedM = 1.2693371e10;
    const precision = -6; // Allows ~0.03% relative tolerance for physical constants.
    expect(schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR)).toBeCloseTo(expectedM, precision);
  });
});
