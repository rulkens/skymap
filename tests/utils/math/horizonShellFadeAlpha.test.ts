/**
 * horizonShellFadeAlpha — distance fade for the observable-universe shell.
 * The band is a fraction of the shell radius (5 %..40 %), so the tests
 * drive it with the real ~14.3-Gpc radius and pin the regime: invisible
 * up close, full once the camera retreats to cosmological scale, and
 * monotonic in between.
 */

import { describe, it, expect } from 'vitest';
import { horizonShellFadeAlpha } from '../../../src/utils/math/horizonShellFadeAlpha';

const RADIUS_MPC = 14_300; // 14.3 Gpc

describe('horizonShellFadeAlpha', () => {
  it('is fully invisible at and below 5% of the shell radius', () => {
    expect(horizonShellFadeAlpha(0, RADIUS_MPC)).toBe(0);
    expect(horizonShellFadeAlpha(0.05 * RADIUS_MPC, RADIUS_MPC)).toBe(0);
    // Galaxy-scale viewing (a few Mpc) is far below the band → invisible.
    expect(horizonShellFadeAlpha(5, RADIUS_MPC)).toBe(0);
  });

  it('is at full strength at and above 40% of the shell radius', () => {
    expect(horizonShellFadeAlpha(0.4 * RADIUS_MPC, RADIUS_MPC)).toBe(1);
    expect(horizonShellFadeAlpha(RADIUS_MPC, RADIUS_MPC)).toBe(1);
  });

  it('ramps monotonically through the band', () => {
    const a = horizonShellFadeAlpha(0.1 * RADIUS_MPC, RADIUS_MPC);
    const b = horizonShellFadeAlpha(0.2 * RADIUS_MPC, RADIUS_MPC);
    const c = horizonShellFadeAlpha(0.3 * RADIUS_MPC, RADIUS_MPC);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(1);
  });

  it('scales the band with the radius (different cosmology, same pacing)', () => {
    // Half the radius → the same fractional distance gives the same alpha.
    const half = RADIUS_MPC / 2;
    expect(horizonShellFadeAlpha(0.2 * half, half)).toBeCloseTo(
      horizonShellFadeAlpha(0.2 * RADIUS_MPC, RADIUS_MPC),
      12,
    );
  });
});
