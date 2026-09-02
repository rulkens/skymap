import { describe, it, expect } from 'vitest';
import { buildSchwarzschildDeflectionLut } from '../../../src/utils/lensing/buildSchwarzschildDeflectionLut';
import type { SchwarzschildDeflectionLut } from '../../../src/@types/lensing/SchwarzschildDeflectionLut';

// Linear interpolation over the LUT's own reported [min, max] range — used
// only far from the photon sphere, where neighbouring grid samples can't
// straddle the finite/captured (Infinity) boundary.
function sampleAt(lut: SchwarzschildDeflectionLut, impactParamRs: number): number {
  const t = (impactParamRs - lut.minImpactParamRs) / (lut.maxImpactParamRs - lut.minImpactParamRs);
  const gridPos = t * (lut.samples.length - 1);
  const i0 = Math.floor(gridPos);
  const i1 = Math.min(i0 + 1, lut.samples.length - 1);
  const frac = gridPos - i0;
  return lut.samples[i0]! * (1 - frac) + lut.samples[i1]! * frac;
}

describe('buildSchwarzschildDeflectionLut', () => {
  it('matches an independently computed weak-field reference to high precision', () => {
    // Independent reference for b = 30 r_s: mpmath (40-digit arbitrary
    // precision) integrating alpha = 2*int_{r0}^inf dr/(r^2 sqrt(F(r))) - pi,
    // F(r) = 1/b^2 - 1/r^2 + 1/r^3, r0 = F's root above the photon sphere
    // (r = 1.5 r_s), via the substitution r = r0 + s^2 (s in [0, inf)) —
    // an algebraic regularisation in r-space, distinct from this module's
    // theta = arcsin(u/u0) trig substitution in u = 1/r space. Cross-checked
    // against scipy.integrate.quad (double precision, adaptive Gauss-Kronrod)
    // to ~1e-13 relative agreement before being taken as ground truth here.
    const lut = buildSchwarzschildDeflectionLut(4096);
    const reference = 0.0701508083168968;
    expect(Math.abs(sampleAt(lut, 30) - reference)).toBeLessThan(1e-4);
  });

  it('matches an independently computed moderately-strong-field reference', () => {
    // Same independent method as above, evaluated at b = 3.0 r_s (~15% above
    // the critical impact parameter — moderately strong field, well clear of
    // the photon-sphere divergence): reference alpha = 1.71938831023017 rad.
    const lut = buildSchwarzschildDeflectionLut(4096);
    const reference = 1.71938831023017;
    expect(Math.abs(sampleAt(lut, 3.0) - reference)).toBeLessThan(1e-3);
  });

  it('grows large approaching the photon sphere from above, and is Infinity (captured) at or below it', () => {
    const lut = buildSchwarzschildDeflectionLut(4096);
    const firstFiniteIndex = lut.samples.findIndex((v) => Number.isFinite(v));
    expect(firstFiniteIndex).toBeGreaterThan(0); // some captured region exists below it
    // The finite sample closest to the photon sphere should already be well
    // beyond the weak-field regime (~0.07 rad at b = 30 r_s checked above).
    expect(lut.samples[firstFiniteIndex]).toBeGreaterThan(3);

    const belowCriticalIndex = Math.round(
      ((2 - lut.minImpactParamRs) / (lut.maxImpactParamRs - lut.minImpactParamRs)) *
        (lut.samples.length - 1),
    );
    expect(lut.samples[belowCriticalIndex]).toBe(Infinity);
  });

  it('ends within a few percent above the analytic 2/b, so the shader 1/b tail is continuous', () => {
    // The fragment extends the deflection beyond the LUT domain as
    // endpoint · (bMax/b) — exactly continuous at the handoff by
    // construction, and a valid ~1/b weak-field tail ONLY IF the endpoint
    // itself sits just above the leading term 2/b (the next-order correction
    // 15π/16 b² is +3.0% at b = 50). A drifted endpoint (bigger LUT domain,
    // broken quadrature) would silently bend the tail; this pins the
    // assumption the shader relies on.
    const lut = buildSchwarzschildDeflectionLut(4096);
    const endpoint = lut.samples[lut.samples.length - 1]!;
    const leading = 2 / lut.maxImpactParamRs;
    expect(endpoint).toBeGreaterThan(leading);
    expect(endpoint).toBeLessThan(leading * 1.05);
  });

  it('strictly decreases across the escaping (finite) branch as impact parameter grows', () => {
    // The sign/ordering check the two point-value tests above could miss:
    // a formula with e.g. a flipped sign would still hit isolated literals
    // by coincidence far more easily than it would preserve a monotonic
    // trend across the whole finite range.
    const lut = buildSchwarzschildDeflectionLut(4096);
    const firstFiniteIndex = lut.samples.findIndex((v) => Number.isFinite(v));
    for (let i = firstFiniteIndex; i < lut.samples.length - 1; i++) {
      expect(lut.samples[i]!).toBeGreaterThan(lut.samples[i + 1]!);
    }
  });
});
