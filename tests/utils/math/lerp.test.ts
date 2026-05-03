import { describe, it, expect } from 'vitest';
import { lerp } from '../../../src/utils/math/lerp';

describe('lerp', () => {
  it('returns a at t=0', () => {
    expect(lerp(3, 9, 0)).toBe(3);
  });

  it('returns b at t=1', () => {
    expect(lerp(3, 9, 1)).toBe(9);
  });

  it('returns the midpoint at t=0.5', () => {
    expect(lerp(3, 9, 0.5)).toBeCloseTo(6, 10);
  });

  it('handles negative ranges', () => {
    expect(lerp(-10, 10, 0.25)).toBeCloseTo(-5, 10);
  });

  it('does not clamp t — extrapolation is the caller’s responsibility', () => {
    // Some animation systems intentionally extrapolate (overshoot springs);
    // lerp itself stays purely mathematical.
    expect(lerp(0, 10, 1.5)).toBeCloseTo(15, 10);
  });
});
