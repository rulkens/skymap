import { describe, it, expect } from 'vitest';
import { youAreHereAlpha, YOU_ARE_HERE_NEAR_MPC, YOU_ARE_HERE_FAR_MPC } from '../../../../src/services/gpu/labels/youAreHereVisibility';

describe('youAreHereAlpha', () => {
  it('is 1.0 when camera is closer than NEAR threshold', () => {
    expect(youAreHereAlpha(0)).toBe(1);
    expect(youAreHereAlpha(YOU_ARE_HERE_NEAR_MPC * 0.5)).toBe(1);
  });

  it('is 0.0 when camera is farther than FAR threshold', () => {
    expect(youAreHereAlpha(YOU_ARE_HERE_FAR_MPC + 1)).toBe(0);
    expect(youAreHereAlpha(1000)).toBe(0);
  });

  it('smoothly fades between NEAR and FAR', () => {
    const mid = (YOU_ARE_HERE_NEAR_MPC + YOU_ARE_HERE_FAR_MPC) / 2;
    const a = youAreHereAlpha(mid);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });

  it('is monotonically decreasing across the band', () => {
    const samples = 10;
    const span = YOU_ARE_HERE_FAR_MPC - YOU_ARE_HERE_NEAR_MPC;
    let prev = youAreHereAlpha(YOU_ARE_HERE_NEAR_MPC);
    for (let i = 1; i <= samples; i++) {
      const a = youAreHereAlpha(YOU_ARE_HERE_NEAR_MPC + (span * i) / samples);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });
});
