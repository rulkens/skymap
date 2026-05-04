import { describe, it, expect } from 'vitest';
import { expectedNumberDensity } from '../../../src/utils/math/schechterDensity';

describe('expectedNumberDensity (Schechter LF integrated to flux limit)', () => {
  // SDSS Blanton 2003 r-band LF: M*=−21.18, α=−1.16, φ*=0.0093
  const sdss = { mStar: -21.18, alpha: -1.16, phiStar: 0.0093, mLim: 17.77 };
  // 2MRS Huchra 2012 K_s-band LF: M*=−24.2, α=−1.02, φ*=0.0108
  const twoMrs = { mStar: -24.2, alpha: -1.02, phiStar: 0.0108, mLim: 11.75 };

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

  // ── Boundary / degenerate inputs ─────────────────────────────────────────

  it('returns 0 for non-positive distance', () => {
    // The function guards `dMpc <= 0` early — galaxies with zero or
    // negative distance (Local Group blueshifts that survive the parser)
    // would otherwise produce a divergent log10(d/10).  We pin the
    // contract here so a future "distance modulus" refactor can't quietly
    // start returning NaN at the local-group origin.
    expect(expectedNumberDensity({ ...sdss, dMpc: 0 })).toBe(0);
    expect(expectedNumberDensity({ ...sdss, dMpc: -50 })).toBe(0);
  });

  it('returns 0 when distance pushes the flux-limit cut past M_brightCut', () => {
    // At absurd distance the apparent-mag flux limit translates to an
    // absolute-mag cutoff *brighter* than any realistic galaxy (M < −30),
    // so the integration window collapses and the density should be 0
    // — not NaN, not a tiny positive number from a degenerate trapezoid.
    // 1e9 Mpc is comfortably past the observable universe.
    expect(expectedNumberDensity({ ...sdss, dMpc: 1e9 })).toBe(0);
  });

  it('returns 0 when the integration window is exactly empty', () => {
    // A flux-limit so bright that even at d=10 Mpc the faintest detectable
    // absolute mag is brighter than M_brightCut=-30.  The function should
    // return 0 from the early guard, never enter the trapezoidal loop.
    expect(expectedNumberDensity({ ...sdss, dMpc: 10, mLim: -50 })).toBe(0);
  });

  // ── Schechter parameter scaling ──────────────────────────────────────────

  it('output scales linearly with phiStar (the LF normalisation)', () => {
    // φ* is a multiplicative factor in front of the integrand, so
    // doubling it must double the output.  This verifies the integration
    // is correctly factoring out the global normalisation — useful
    // because a future caller might pass through a survey-specific φ*
    // and we want to be sure the rest of the math is φ*-agnostic.
    const a = expectedNumberDensity({ ...sdss, phiStar: 0.0093, dMpc: 200 });
    const b = expectedNumberDensity({ ...sdss, phiStar: 0.0186, dMpc: 200 });
    expect(b / a).toBeCloseTo(2, 6);
  });

  it('brighter flux limit (smaller mLim) yields lower density', () => {
    // A brighter survey limit (e.g. 2MRS at K_s=11.75) sees only the
    // brightest galaxies — the integration window shrinks at any
    // distance, so n(d) drops compared to a deeper survey (SDSS at 17.77).
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

  it('matches expected SDSS vs 2MRS density ordering at d=100 Mpc', () => {
    // Cross-survey sanity: at d=100 Mpc, SDSS (deeper r-band, mLim=17.77)
    // detects more galaxies per Mpc³ than 2MRS (shallow K_s, mLim=11.75).
    // The exact ratio depends on the band-specific LF (2MRS's brighter
    // M*=−24.2 partially compensates for the shallower flux limit), so
    // we assert direction only — the cross-survey *ordering* is the
    // physically-meaningful invariant; the magnitude is sensitive to LF
    // parameter choices that may evolve as the catalogues are revisited.
    const sdssN = expectedNumberDensity({ ...sdss, dMpc: 100 });
    const twoMrsN = expectedNumberDensity({ ...twoMrs, dMpc: 100 });
    expect(sdssN).toBeGreaterThan(twoMrsN);
  });

  // ── Numerical stability ──────────────────────────────────────────────────

  it('produces finite results across the full SDSS survey distance range', () => {
    // Guard against silent NaN / Infinity sneaking in at the integration
    // edges.  Sweeps the SDSS distance range used by the visualisation
    // and asserts every single sample is a finite, non-negative number.
    for (let d = 1; d <= 1000; d += 25) {
      const n = expectedNumberDensity({ ...sdss, dMpc: d });
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});
