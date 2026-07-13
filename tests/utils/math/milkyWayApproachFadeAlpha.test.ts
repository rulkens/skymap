import { describe, it, expect } from 'vitest';
import { milkyWayApproachFadeAlpha } from '../../../src/utils/math/milkyWayApproachFadeAlpha';

describe('milkyWayApproachFadeAlpha', () => {
  it('returns 0.0 at the world origin (camera at the Sun, deep inside)', () => {
    expect(milkyWayApproachFadeAlpha(0)).toBe(0.0);
  });

  it('returns 0.0 at the inner edge (2 kpc — fully hidden)', () => {
    expect(milkyWayApproachFadeAlpha(0.002)).toBe(0.0);
  });

  it('returns 1.0 at and beyond the outer edge (8 kpc — full visibility)', () => {
    expect(milkyWayApproachFadeAlpha(0.008)).toBe(1.0);
    expect(milkyWayApproachFadeAlpha(0.04)).toBe(1.0);
  });

  it('returns 0.5 at the band midpoint (5 kpc) — smoothstep symmetry', () => {
    // Midpoint of [0.002, 0.008] is 0.005; smoothstep at t=0.5 is exactly 0.5.
    expect(milkyWayApproachFadeAlpha(0.005)).toBeCloseTo(0.5, 5);
  });

  it('is monotonically non-decreasing across the band', () => {
    let prev = -Infinity;
    for (let d = 0; d <= 0.01; d += 0.0002) {
      const a = milkyWayApproachFadeAlpha(d);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});
