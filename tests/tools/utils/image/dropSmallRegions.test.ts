import { describe, expect, it } from 'vitest';

import { dropSmallRegions } from '../../../../tools/utils/image/dropSmallRegions';

describe('dropSmallRegions', () => {
  it('drops a thin diagonal arc and an island, keeps the big region (also across the seam)', () => {
    const W = 8;
    const H = 6;
    const g = new Float32Array(W * H).fill(NaN);
    for (const x of [0, 1, 7]) for (let y = 3; y < 6; y++) g[y * W + x] = 1; // wraps: 9 cells
    for (let i = 0; i < 3; i++) g[i * W + 3 + i] = 2; // diagonal arc: 8-connected, 3 cells
    g[0 * W + 7] = 3; // lone cell
    dropSmallRegions(g, W, H, 0.5);
    expect(g.filter((v) => v === 1).length).toBe(9);
    expect(g.filter((v) => v === 2 || v === 3).length).toBe(0);
  });
});
