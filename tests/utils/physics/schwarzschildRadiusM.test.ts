import { describe, it, expect } from 'vitest';

import { schwarzschildRadiusM } from '../../../src/utils/physics/schwarzschildRadiusM';
import { SGR_A_STAR_MASS_SOLAR } from '../../../src/data/bodies/sgrAStarMassSolar';

describe('schwarzschildRadiusM', () => {
  it('computes Sgr A* Schwarzschild radius within relative tolerance', () => {
    // Reference: GRAVITY Collaboration 2019, A&A 625, L10 — the spec's
    // externally cited figure is 12.69e6 km = 1.269e10 m (not back-filled
    // from the implementation's output).
    const expectedM = 1.269e10;
    const result = schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR);
    const relError = Math.abs(result - expectedM) / expectedM;
    // ~0.1% relative tolerance catches physics bugs (wrong power, missing 2,
    // unit slip are all ≫0.1%) while allowing constant-precision drift.
    expect(relError).toBeLessThan(0.001);
  });
});
