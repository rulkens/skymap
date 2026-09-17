import { describe, expect, it } from 'vitest';

import { sampleSlope } from '../../../../tools/utils/textures/sampleSlope';
import type { SlopeLattice } from '../../../../tools/textures/SlopeLattice';

function lattice(): SlopeLattice {
  // 2x2 posts, distinct sx/sy per post so a bilinear bug (wrong axis, wrong
  // weight) shows up as a wrong number rather than a coincidental match.
  return {
    west: 0,
    north: 0,
    stepDeg: 1,
    nx: 2,
    ny: 2,
    sx: new Float32Array([0, 0.2, 0.4, 0.6]),
    sy: new Float32Array([1, 1.2, 1.4, 1.6]),
  };
}

describe('sampleSlope', () => {
  it('matches a post exactly at the post', () => {
    const l = lattice();
    const [sxA, syA] = sampleSlope(l, 1, 0);
    expect(sxA).toBeCloseTo(0.2, 6);
    expect(syA).toBeCloseTo(1.2, 6);
    const [sxB, syB] = sampleSlope(l, 0, -1);
    expect(sxB).toBeCloseTo(0.4, 6);
    expect(syB).toBeCloseTo(1.4, 6);
  });

  it('interpolates between posts', () => {
    const l = lattice();
    const [sx, sy] = sampleSlope(l, 0.5, -0.5);
    expect(sx).toBeCloseTo((0 + 0.2 + 0.4 + 0.6) / 4, 6);
    expect(sy).toBeCloseTo((1 + 1.2 + 1.4 + 1.6) / 4, 6);
  });
});
