import { describe, expect, it } from 'vitest';
import { starTintFromBpRp } from '../../../src/utils/color/starTintFromBpRp';

// The two fixtures below are hand-computed from the canonical ramp in
// starCatalog/tint.wesl (anchors ob/af, breakpoints -0.30 / 0.30). If the
// WESL ramp ever changes, these expectations must change with it — that is
// the drift the CPU twin exists to guard against.

describe('starTintFromBpRp', () => {
  it('returns the O/B anchor below the first breakpoint', () => {
    // bpRp = -0.5 sits below the first breakpoint (-0.30): every segment's
    // saturated interpolant is 0, so the running value never leaves the
    // bluest anchor. The ramp has a clamped flat blue end.
    expect(starTintFromBpRp(-0.5)).toEqual([0.6, 0.7, 1.0]);
  });

  it('interpolates to a segment midpoint', () => {
    // bpRp = 0.0 is exactly halfway between -0.30 and 0.30, so the first
    // mix runs at t = 0.5 and later segments stay at 0. The result is the
    // componentwise midpoint of the O/B (0.6, 0.7, 1.0) and A/F
    // (1.0, 1.0, 0.98) anchors — computed independently here:
    //   r = (0.6 + 1.0) / 2 = 0.80
    //   g = (0.7 + 1.0) / 2 = 0.85
    //   b = (1.0 + 0.98) / 2 = 0.99
    const [r, g, b] = starTintFromBpRp(0.0);
    expect(r).toBeCloseTo(0.8, 12);
    expect(g).toBeCloseTo(0.85, 12);
    expect(b).toBeCloseTo(0.99, 12);
  });
});
