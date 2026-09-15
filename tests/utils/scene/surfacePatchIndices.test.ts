import { describe, it, expect } from 'vitest';

import { surfacePatchIndices } from '../../../src/utils/scene/surfacePatchIndices';

const RESOLUTION = 8;

/** Grid vertex `(i, j)` laid flat at `(i, j, 0)`; a skirt vertex hangs at its
 *  boundary post with `z = −1`, so a triangle's normal names its outward side. */
function flatPosition(vid: number, n: number): [number, number, number] {
  const row = n + 1;
  if (vid < row * row) return [vid % row, Math.floor(vid / row), 0];
  const sid = vid - row * row;
  const e = Math.floor(sid / row);
  const k = sid % row;
  if (e === 0) return [0, k, -1];
  if (e === 1) return [n, k, -1];
  if (e === 2) return [k, 0, -1];
  return [k, n, -1];
}

function cross(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): [number, number, number] {
  const ab: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
}

describe('surfacePatchIndices', () => {
  it('winds every grid triangle CCW in the (i, j) parametric plane', () => {
    const indices = surfacePatchIndices(RESOLUTION);
    for (let t = 0; t < 6 * RESOLUTION * RESOLUTION; t += 3) {
      const a = flatPosition(indices[t]!, RESOLUTION);
      const b = flatPosition(indices[t + 1]!, RESOLUTION);
      const c = flatPosition(indices[t + 2]!, RESOLUTION);
      expect(cross(a, b, c)[2]).toBeGreaterThan(0);
    }
  });

  it('covers the grid and the skirt ring', () => {
    const indices = surfacePatchIndices(RESOLUTION);
    const row = RESOLUTION + 1;
    for (const vid of indices) expect(vid).toBeLessThan(row * row + 4 * row);
  });

  it('keeps the n = 64 template inside uint16', () => {
    const indices = surfacePatchIndices(64);
    expect(indices.length).toBe(26112);
    expect(Math.max(...indices)).toBeLessThan(65536);
  });

  /**
   * The one bug class here no screenshot at an ordinary pose reveals: under
   * `frontFace: 'ccw'` + `cullMode: 'back'` a reversed skirt quad is simply
   * invisible, so the seam it was hiding keeps gaping with nothing on screen
   * to blame.
   */
  it('winds skirt quads outward on all four edges', () => {
    const indices = surfacePatchIndices(RESOLUTION);
    const outward: readonly (readonly [number, number, number])[] = [
      [-1, 0, 0], // west
      [1, 0, 0], // east
      [0, -1, 0], // south
      [0, 1, 0], // north
    ];
    const gridIndices = 6 * RESOLUTION * RESOLUTION;
    for (let t = gridIndices; t < indices.length; t += 3) {
      const e = Math.floor((t - gridIndices) / (6 * RESOLUTION));
      const n = cross(
        flatPosition(indices[t]!, RESOLUTION),
        flatPosition(indices[t + 1]!, RESOLUTION),
        flatPosition(indices[t + 2]!, RESOLUTION),
      );
      const want = outward[e]!;
      expect(n[0] * want[0] + n[1] * want[1] + n[2] * want[2]).toBeGreaterThan(0);
    }
  });
});
