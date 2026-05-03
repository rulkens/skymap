/**
 * galaxyDiameterKpc applies the Tully (1988) size–luminosity relation when
 * an absolute B magnitude is supplied:
 *
 *   log10(R_25_kpc) = -0.249 · (M_B + 21) + 1.366
 *   D_25_kpc        = 2 · 10^log10R
 *
 * Sanity check: M_B = -20.5 (Milky Way-ish L*) →
 *   log10R = -0.249 · (0.5) + 1.366 = -0.1245 + 1.366 = 1.2415
 *   R      = 10^1.2415 ≈ 17.43 kpc
 *   D      = 2R ≈ 34.86 kpc
 * Close to the canonical Milky Way D_25 ≈ 30 kpc — within 15 %, expected
 * for a single-relation linear fit across all galaxy types.
 *
 * When `absMagBmag` is undefined / NaN we fall back to
 * DEFAULT_GALAXY_DIAMETER_KPC = 30.
 */

import { describe, it, expect } from 'vitest';
import {
  galaxyDiameterKpc,
  DEFAULT_GALAXY_DIAMETER_KPC,
} from '../../../src/utils/math/galaxyDiameterKpc';

describe('galaxyDiameterKpc', () => {
  it('returns the default when no input is supplied', () => {
    expect(galaxyDiameterKpc({})).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });

  it('returns the default when absMagBmag is NaN', () => {
    expect(galaxyDiameterKpc({ absMagBmag: NaN })).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });

  it('returns ~34.9 kpc for M_B = -20.5 (Milky-Way-ish L*)', () => {
    expect(galaxyDiameterKpc({ absMagBmag: -20.5 })).toBeCloseTo(34.86, 1);
  });

  it('returns a smaller diameter for a fainter galaxy (M_B = -18)', () => {
    expect(galaxyDiameterKpc({ absMagBmag: -18 })).toBeCloseTo(8.32, 1);
  });

  it('returns a larger diameter for a brighter galaxy (M_B = -22.5)', () => {
    expect(galaxyDiameterKpc({ absMagBmag: -22.5 })).toBeCloseTo(109.81, 1);
  });

  it('clamps to a sensible minimum to avoid zero/negative diameters', () => {
    expect(galaxyDiameterKpc({ absMagBmag: -10 })).toBeGreaterThanOrEqual(1);
  });
});
