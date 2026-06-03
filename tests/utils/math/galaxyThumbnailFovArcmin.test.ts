import { describe, it, expect } from 'vitest';
import { galaxyThumbnailFovArcmin } from '../../../src/utils/math/galaxyThumbnailFovArcmin';

/**
 * The thumbnail field of view should track the galaxy's apparent angular size
 * so a nearby giant and a distant dwarf both roughly fill the frame, instead
 * of a fixed FOV that crops the former and shrinks the latter to a speck.
 */
describe('galaxyThumbnailFovArcmin', () => {
  it('scales with angular size: a closer galaxy gets a wider FOV than a far one', () => {
    const near = galaxyThumbnailFovArcmin(30, 50);
    const far = galaxyThumbnailFovArcmin(30, 400);
    expect(near).toBeGreaterThan(far);
  });

  it('computes ~angular-size × margin for a typical galaxy', () => {
    // 30 kpc at 100 Mpc → θ = 30/100 × 3.4377 ≈ 1.031 arcmin; ×1.6 margin ≈ 1.65.
    expect(galaxyThumbnailFovArcmin(30, 100)).toBeCloseTo(1.65, 1);
  });

  it('clamps a huge nearby galaxy to the ceiling (M31-scale)', () => {
    // 67 kpc at 0.78 Mpc → θ ≈ 295 arcmin, far past the cap.
    expect(galaxyThumbnailFovArcmin(67, 0.78)).toBe(200);
  });

  it('clamps a tiny distant galaxy up to the floor', () => {
    // 15 kpc at 800 Mpc → θ ≈ 0.064 arcmin, below the floor.
    expect(galaxyThumbnailFovArcmin(15, 800)).toBe(1);
  });

  it('falls back to the 2-arcmin default when inputs are missing or non-finite', () => {
    expect(galaxyThumbnailFovArcmin(0, 100)).toBe(2);
    expect(galaxyThumbnailFovArcmin(30, 0)).toBe(2);
    expect(galaxyThumbnailFovArcmin(NaN, 100)).toBe(2);
  });
});
