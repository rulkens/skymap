// tests/utils/lensing/clusterLensDeflection.test.ts
import { describe, it, expect } from 'vitest';
import { clusterLensDeflection } from '../../../src/utils/lensing/clusterLensDeflection';

describe('clusterLensDeflection', () => {
  it('matches the Coma sanity check at R500 = 1.4 Mpc', () => {
    // Coma R500 ≈ 1.4 Mpc → α∞ a few × 1e-4 rad (real cluster Einstein
    // radii are tens of arcsec). Band is generous: the fiducials (c500,
    // ρ_crit, H0) are approximations, so we assert the right ORDER of
    // magnitude, not a tight value.
    const { alphaInfRad } = clusterLensDeflection(1.4);
    expect(alphaInfRad).toBeGreaterThan(1.0e-4);
    expect(alphaInfRad).toBeLessThan(2.5e-4);
  });

  it('returns r_s = R500 / 3.2', () => {
    const { rsMpc } = clusterLensDeflection(1.4);
    expect(rsMpc).toBeCloseTo(1.4 / 3.2, 10);
  });

  it('is zero at R500 = 0', () => {
    const out = clusterLensDeflection(0);
    expect(out.alphaInfRad).toBe(0);
    expect(out.rsMpc).toBe(0);
  });

  it('scales α∞ as R500² (quadrupling at double radius)', () => {
    const a1 = clusterLensDeflection(1).alphaInfRad;
    const a2 = clusterLensDeflection(2).alphaInfRad;
    expect(a2 / a1).toBeCloseTo(4, 6);
  });

  it('is monotonic increasing in R500', () => {
    const a = clusterLensDeflection(0.5).alphaInfRad;
    const b = clusterLensDeflection(1.0).alphaInfRad;
    const c = clusterLensDeflection(2.0).alphaInfRad;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
