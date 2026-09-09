/**
 * lensQuadPlaneRadiusRs — the lens billboard's covering radius must be exact
 * where the inversion is well-conditioned, bounded in the degenerate
 * close-orbit regime, and smooth everywhere in between (the close-orbit
 * shake regression, audit-cubemap-alignment.md §9: the old in-shader f32
 * formula jumped to ~5e4× the anchor distance the moment
 * edgeFadeEndRs ≥ distRs).
 */

import { describe, it, expect } from 'vitest';
import { lensQuadPlaneRadiusRs } from '../../../src/utils/lensing/lensQuadPlaneRadiusRs';

describe('lensQuadPlaneRadiusRs', () => {
  it('inverts b = R·d/sqrt(R²+d²) exactly in the well-conditioned regime', () => {
    // fadeEnd 2400 at d 4000 (the ~341 AU validation view): R = 2400·4000/3200.
    const r = lensQuadPlaneRadiusRs(2400, 4000);
    expect(r).toBeCloseTo(3000, 8);
    // Round trip: the plane radius must map back to the requested b.
    expect((r * 4000) / Math.hypot(r, 4000)).toBeCloseTo(2400, 6);
  });

  it('caps at 8× the anchor distance once coverage is geometrically impossible', () => {
    // Close orbit: the lutMax floor puts fadeEnd (50) above distRs (20). The
    // old shader formula returned ~1e6 r_s here — a 5e4× varying-magnitude
    // ratio and visible per-frame shimmer.
    expect(lensQuadPlaneRadiusRs(50, 20)).toBe(160);
    expect(lensQuadPlaneRadiusRs(50, 50)).toBe(400); // discriminant exactly 0
  });

  it('stays smooth through the coverable/degenerate crossover', () => {
    // Sweep distRs across fadeEnd = 50 in fine steps: consecutive radii may
    // differ by at most a small relative step — the revert (in-shader f32
    // formula with its 1e-6 floor) jumps ~3 orders of magnitude at d = 50.
    let prev = lensQuadPlaneRadiusRs(50, 45);
    for (let d = 45.001; d <= 60; d += 0.001) {
      const r = lensQuadPlaneRadiusRs(50, d);
      expect(Math.abs(r - prev) / prev).toBeLessThan(0.01);
      prev = r;
    }
  });
});
