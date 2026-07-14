import { describe, expect, it } from 'vitest';
import { bvToBpRp } from '../../../../tools/utils/color/bvToBpRp';

/**
 * These tests guard the transcription of the Gaia DR3 Table 5.9 polynomial
 * (G_BP − G_RP = f(B−V)) — see the docblock in bvToBpRp.ts for the source.
 * The reference values below are computed BY HAND from the cited coefficients
 * (arithmetic spelled out in comments), independently of the implementation,
 * so a fat-fingered coefficient would break the test rather than be mirrored.
 */
describe('bvToBpRp', () => {
  it('matches the published relation at reference colours', () => {
    // Coefficients (Table 5.9): 0.06483, 1.575, −0.7815, 0.5707, −0.176.

    // B−V = 0 (A0V / Vega-like anchor): every colour term vanishes, so the
    // result is exactly the constant term. This pins the intercept.
    expect(bvToBpRp(0)).toBeCloseTo(0.06483, 5);

    // B−V = 0.65 (Sun-like G2V). Powers: 0.4225, 0.274625, 0.17850625.
    //   0.06483
    // + 1.575  · 0.65        =  1.02375
    // − 0.7815 · 0.4225      = −0.33018375
    // + 0.5707 · 0.274625    =  0.15672849
    // − 0.176  · 0.17850625  = −0.03141710
    //   ------------------------------------
    //   ≈ 0.883708
    expect(bvToBpRp(0.65)).toBeCloseTo(0.883708, 4);

    // B−V = 1.5 (red K/M star). Powers: 2.25, 3.375, 5.0625.
    //   0.06483
    // + 1.575  · 1.5     =  2.3625
    // − 0.7815 · 2.25    = −1.758375
    // + 0.5707 · 3.375   =  1.9261125
    // − 0.176  · 5.0625  = −0.891
    //   ------------------------------
    //   ≈ 1.704068
    expect(bvToBpRp(1.5)).toBeCloseTo(1.704068, 4);
  });

  it('is monotonic across the valid B−V range', () => {
    // Property: redder Johnson colour ⇒ larger Gaia BP−RP. The published
    // degree-4 fit only holds this up to its turnover at B−V ≈ 1.88 (see the
    // docblock); beyond that the polynomial rolls over — an edge-of-fit
    // artefact, not a physical inversion. We assert strict monotonicity over
    // −0.5 … 1.85, which covers all ordinary stellar colours and effectively
    // the entire Hp < 4.0 bright set (B−V ≈ −0.3 … +1.9).
    let prev = -Infinity;
    for (let bv = -0.5; bv <= 1.85 + 1e-9; bv += 0.01) {
      const bpRp = bvToBpRp(bv);
      expect(bpRp).toBeGreaterThan(prev);
      prev = bpRp;
    }
  });
});
