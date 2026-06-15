import { describe, it, expect } from 'vitest';
import { milkyWayFadeAlpha } from '../../../src/utils/math/milkyWayFadeAlpha';

describe('milkyWayFadeAlpha', () => {
  it('returns 1.0 at the world origin (camera on Earth)', () => {
    expect(milkyWayFadeAlpha(0)).toBe(1.0);
  });

  it('returns 1.0 at the inner edge (10 Mpc) — full impostor visibility', () => {
    expect(milkyWayFadeAlpha(10)).toBe(1.0);
  });

  it('returns 0.0 at the outer edge (50 Mpc) — fully faded', () => {
    expect(milkyWayFadeAlpha(50)).toBe(0.0);
  });

  it('returns 0.0 well beyond the outer edge', () => {
    expect(milkyWayFadeAlpha(100)).toBe(0.0);
    expect(milkyWayFadeAlpha(10000)).toBe(0.0);
  });

  it('returns 0.5 at the midpoint (30 Mpc) — smoothstep symmetry', () => {
    // Smoothstep at t=0.5 evaluates to 0.5 exactly: 3·0.5² − 2·0.5³ = 0.5.
    // Our fade is `1 - smoothstep(10, 50, x)`, so at x=30 (midpoint of band)
    // smoothstep returns 0.5, fade returns 0.5.
    expect(milkyWayFadeAlpha(30)).toBeCloseTo(0.5, 5);
  });

  it('is monotonically non-increasing across the band', () => {
    let prev = Infinity;
    for (let d = 0; d <= 60; d += 0.5) {
      const a = milkyWayFadeAlpha(d);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('clamps negative input to full visibility (defensive)', () => {
    expect(milkyWayFadeAlpha(-5)).toBe(1.0);
  });
});
