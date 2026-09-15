import { describe, it, expect } from 'vitest';
import { expectedNumberDensity } from '../../../src/utils/math/expectedNumberDensity';

describe('expectedNumberDensity (Schechter LF integrated to flux limit)', () => {
  // SDSS Blanton 2003 r-band LF: M*=−21.18, α=−1.16, φ*=0.0093
  const sdss = { mStar: -21.18, alpha: -1.16, phiStar: 0.0093, mLim: 17.77 };
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

  // ── Boundary / degenerate inputs ─────────────────────────────────────────

  it('returns 0 when distance pushes the flux-limit cut past M_brightCut', () => {
    // At absurd distance the apparent-mag flux limit translates to an
    // absolute-mag cutoff *brighter* than any realistic galaxy (M < −30),
    // so the integration window collapses and the density should be 0
    // — not NaN, not a tiny positive number from a degenerate trapezoid.
    // 1e9 Mpc is comfortably past the observable universe.
    expect(expectedNumberDensity({ ...sdss, dMpc: 1e9 })).toBe(0);
  });

  // ── Schechter parameter scaling ──────────────────────────────────────────

  it('brighter flux limit (smaller mLim) yields lower density', () => {
    // A brighter galaxy catalog limit (e.g. 2MRS at K_s=11.75) sees only the
    // brightest galaxies — the integration window shrinks at any
    // distance, so n(d) drops compared to a deeper galaxy catalog (SDSS at 17.77).
    // The same Schechter LF parameters are used to isolate the mLim
    // effect.  A 6-magnitude difference in mLim is 250× fainter
    // detection threshold; the density ratio at d=200 Mpc should be
    // a couple orders of magnitude smaller.
    const deep = expectedNumberDensity({ ...sdss, dMpc: 200 });
    const shallow = expectedNumberDensity({ ...sdss, mLim: 11.77, dMpc: 200 });
    expect(shallow).toBeLessThan(deep);
    // The ratio is enormous — a 6-mag-brighter cutoff is 250× brighter
    // intensity, and combined with the steep faint-end LF slope the
    // density ratio at d=200 Mpc lands in the 1e13 range.  We assert
    // only the direction + a generous lower bound (>5×) so a future
    // refactor to the LF or distance-modulus path can't quietly invert
    // the relationship.
    expect(deep / shallow).toBeGreaterThan(5);
  });

  it('steeper faint-end slope (more negative α) raises faint-end density', () => {
    // The faint-end slope α controls how steeply the LF rises toward
    // faint M.  α=−1.5 has many more dim galaxies than α=−0.5; at any
    // distance where the flux limit clips below M*, the steep-α version
    // should produce a higher detected density.  d=50 Mpc puts SDSS's
    // mLim cutoff at M=-15.7, well into the faint-slope regime.
    const flat = expectedNumberDensity({ ...sdss, alpha: -0.5, dMpc: 50 });
    const steep = expectedNumberDensity({ ...sdss, alpha: -1.5, dMpc: 50 });
    expect(steep).toBeGreaterThan(flat);
  });
});
