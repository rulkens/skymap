import { describe, expect, it } from 'vitest';

import { icqPointsToEquirectRadius } from '../../../../tools/utils/shape/icqPointsToEquirectRadius';

const W = 8;
const H = 4;
const DEG = Math.PI / 180;

/** One point per cell centre of a W×H grid, at texture lon/lat, shifted by `offsetDeg` in shape lon. */
function cloud(radiusAt: (col: number, row: number) => number, offsetDeg: number): number[] {
  const pts: number[] = [];
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const lon = (((col + 0.5) / W - 0.5) * 360 + offsetDeg) * DEG;
      const lat = (0.5 - (row + 0.5) / H) * 180 * DEG;
      const r = radiusAt(col, row);
      pts.push(
        r * Math.cos(lat) * Math.cos(lon),
        r * Math.cos(lat) * Math.sin(lon),
        r * Math.sin(lat),
      );
    }
  }
  return pts;
}

describe('icqPointsToEquirectRadius', () => {
  it('a sphere rasterises to a constant grid', () => {
    const grid = icqPointsToEquirectRadius(
      cloud(() => 100, 0),
      W,
      H,
      0,
    );
    for (const v of grid) expect(v).toBeCloseTo(100, 3);
  });

  it('places a bump at the texture column, reading the shape at longitude + offset, wrapping in x', () => {
    // 45° = one column at W=8; the bump at the last column lands past +180° in shape lon.
    const grid = icqPointsToEquirectRadius(
      cloud((c, r) => (c === 7 && r === 1 ? 150 : 100), 45),
      W,
      H,
      45,
    );
    expect(grid[1 * W + 7]).toBeCloseTo(150, 3);
    expect(grid[1 * W + 6]).toBeCloseTo(100, 3);
    expect(grid[1 * W + 0]).toBeCloseTo(100, 3);
  });

  it('fills cells no point reaches', () => {
    const sparse = cloud(() => 100, 0).slice(0, 3 * W);
    const grid = icqPointsToEquirectRadius(sparse, W, H, 0);
    for (const v of grid) expect(v).toBeCloseTo(100, 3);
  });
});
