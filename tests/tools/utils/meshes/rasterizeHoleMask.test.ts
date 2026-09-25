import { describe, it, expect } from 'vitest';

import { rasterizeHoleMask } from '../../../../tools/utils/meshes/rasterizeHoleMask';

/** Counts of set (255) pixels per row, for asserting which rows are filled. */
function rowCounts(mask: Uint8Array, width: number, height: number): number[] {
  const counts: number[] = [];
  for (let row = 0; row < height; row++) {
    let n = 0;
    for (let col = 0; col < width; col++) if (mask[row * width + col] === 255) n++;
    counts.push(n);
  }
  return counts;
}

describe('rasterizeHoleMask', () => {
  it('a 100x100 m square at 1 m/px, erode 0, is entirely 255 inside', () => {
    const ring: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const { mask, width, height } = rasterizeHoleMask(ring, 1, 0);

    expect(width).toBeGreaterThanOrEqual(99);
    expect(width).toBeLessThanOrEqual(101);
    expect(height).toBeGreaterThanOrEqual(99);
    expect(height).toBeLessThanOrEqual(101);
    for (let i = 0; i < mask.length; i++) expect(mask[i]).toBe(255);
  });

  it('erode 2 clears a 2 m band along every edge', () => {
    const ring: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const { mask, width, height } = rasterizeHoleMask(ring, 1, 2);

    // Pixel centres are at k + 0.5; a 2 m erosion clears centres under 2 m
    // from any edge — columns/rows 0 and 1 (centres 0.5, 1.5) go to 0, and
    // the far side symmetrically (centres width-1.5, width-0.5).
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const nearEdge = col < 2 || row < 2 || col >= width - 2 || row >= height - 2;
        if (nearEdge) expect(mask[row * width + col]).toBe(0);
      }
    }
    // The centre stays a hole.
    const midRow = Math.floor(height / 2);
    const midCol = Math.floor(width / 2);
    expect(mask[midRow * width + midCol]).toBe(255);
  });

  it("an L-shaped ring's notch stays 0", () => {
    // An L: the outer 100x100 square minus its top-right 40x40 corner
    // (x in [60, 100], y in [60, 100]).
    const ring: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 60],
      [60, 60],
      [60, 100],
      [0, 100],
    ];
    const { mask, width, height } = rasterizeHoleMask(ring, 1, 0);

    // A point deep in the notch (outside the L).
    const notchCol = Math.round(80 * (width / 100));
    const notchRow = height - Math.round(80 * (height / 100)); // row 0 = north = high y
    expect(mask[notchRow * width + notchCol]).toBe(0);
    // A point deep in the filled arm of the L.
    const filledCol = Math.round(20 * (width / 100));
    const filledRow = height - Math.round(20 * (height / 100));
    expect(mask[filledRow * width + filledCol]).toBe(255);
  });

  it('row 0 is the NORTH edge (max Y), not the south one', () => {
    // A triangle with its wide base along the north edge (y = 100) and its
    // apex at the south (50, 0): row 0 (near y = 100) is filled edge to
    // edge, the last row (near y = 0) is empty.
    const ring: [number, number][] = [
      [0, 100],
      [100, 100],
      [50, 0],
    ];
    const { mask, width, height } = rasterizeHoleMask(ring, 1, 0);
    const counts = rowCounts(mask, width, height);

    expect(counts[0]).toBeGreaterThan(width * 0.9);
    expect(counts[height - 1]).toBeLessThan(width * 0.05);
  });
});
