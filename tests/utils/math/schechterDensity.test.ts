import { describe, it, expect } from 'vitest';
import { expectedNumberDensity } from '../../../src/utils/math/schechterDensity';

describe('expectedNumberDensity (Schechter LF integrated to flux limit)', () => {
  // SDSS Blanton 2003 r-band LF: M*=−21.18, α=−1.16, φ*=0.0093
  const sdss = { mStar: -21.18, alpha: -1.16, phiStar: 0.0093, mLim: 17.77 };

  it('density at d=100 Mpc is well-defined and positive', () => {
    const n = expectedNumberDensity({ ...sdss, dMpc: 100 });
    expect(n).toBeGreaterThan(0);
    expect(Number.isFinite(n)).toBe(true);
  });

  it('density decreases monotonically with distance', () => {
    const n100 = expectedNumberDensity({ ...sdss, dMpc: 100 });
    const n500 = expectedNumberDensity({ ...sdss, dMpc: 500 });
    const n1000 = expectedNumberDensity({ ...sdss, dMpc: 1000 });
    expect(n500).toBeLessThan(n100);
    expect(n1000).toBeLessThan(n500);
  });

  it('density at d=10 Mpc approaches Schechter total density φ*·Γ(α+1)', () => {
    // At very small distance every galaxy is brighter than the flux
    // limit — the integral covers the entire LF.  Numerical Γ(α+1) for
    // α=−1.16 ≈ 5.78, so n_total ≈ 0.0093 × 5.78 ≈ 0.054 / Mpc³.
    // We compare order-of-magnitude only because our integration is a
    // discrete sum, not the closed-form Γ.
    const n = expectedNumberDensity({ ...sdss, dMpc: 10 });
    expect(n).toBeGreaterThan(0.01);
    expect(n).toBeLessThan(0.5);
  });
});
