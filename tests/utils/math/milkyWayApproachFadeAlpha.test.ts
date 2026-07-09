import { describe, it, expect } from 'vitest';
import { milkyWayApproachFadeAlpha } from '../../../src/utils/math/milkyWayApproachFadeAlpha';

describe('milkyWayApproachFadeAlpha', () => {
  it('returns 0.0 at the world origin (camera at the Sun, deep inside)', () => {
    expect(milkyWayApproachFadeAlpha(0)).toBe(0.0);
  });

  it('returns 0.0 at and below the inner edge (8 kpc — fully hidden)', () => {
    expect(milkyWayApproachFadeAlpha(0.008)).toBe(0.0);
    expect(milkyWayApproachFadeAlpha(0.004)).toBe(0.0);
  });

  it('returns 1.0 at and beyond the outer edge (40 kpc — full visibility)', () => {
    expect(milkyWayApproachFadeAlpha(0.04)).toBe(1.0);
    expect(milkyWayApproachFadeAlpha(0.12)).toBe(1.0);
  });

  it('keeps the impostor full at the 0.15 Mpc home framing', () => {
    expect(milkyWayApproachFadeAlpha(0.15)).toBe(1.0);
  });

  it('returns 0.5 at the band midpoint (24 kpc) — smoothstep symmetry', () => {
    // Midpoint of [0.008, 0.040] is 0.024; smoothstep at t=0.5 is exactly 0.5.
    expect(milkyWayApproachFadeAlpha(0.024)).toBeCloseTo(0.5, 5);
  });

  it('is monotonically non-decreasing across the band', () => {
    let prev = -Infinity;
    for (let d = 0; d <= 0.05; d += 0.001) {
      const a = milkyWayApproachFadeAlpha(d);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});
