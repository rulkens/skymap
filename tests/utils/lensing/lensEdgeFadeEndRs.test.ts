/**
 * lensEdgeFadeEndRs — the three regimes of `max(lutMax, min(2·pxPerRad, 0.6·dist))`.
 */

import { describe, it, expect } from 'vitest';
import { lensEdgeFadeEndRs } from '../../../src/utils/lensing/lensEdgeFadeEndRs';

describe('lensEdgeFadeEndRs', () => {
  it('floors at the LUT max close-in, where both pixel and distance terms undercut it', () => {
    expect(lensEdgeFadeEndRs(20, 100, 50)).toBe(50);
  });

  it('picks 2·pxPerRad when the pixel term is the smallest term above the LUT floor', () => {
    // 2·pxPerRad = 40, 0.6·dist = 6000 — pxPerRad wins.
    expect(lensEdgeFadeEndRs(10000, 20, 1)).toBe(40);
  });

  it('picks 0.6·dist when the distance term is the smallest term above the LUT floor', () => {
    // 2·pxPerRad = 4000, 0.6·dist = 60 — distance wins.
    expect(lensEdgeFadeEndRs(100, 2000, 1)).toBe(60);
  });
});
