import { describe, expect, it } from 'vitest';
import { rotatedBoxBounds } from '../../../src/utils/labels/rotatedBoxBounds';

// A second box after a decoy, so a wrong `boxAt` or `outAt` shows.
const BOXES = [9, 9, 9, 9, -50, -18, 50, 2];
const bounds = (up: [number, number], scale: number, at: [number, number]): number[] => {
  const out = new Float32Array(8).fill(-1);
  rotatedBoxBounds(BOXES, 4, scale, up, at, out, 4);
  expect([...out.subarray(0, 4)]).toEqual([-1, -1, -1, -1]);
  return [...out.subarray(4)];
};

describe('rotatedBoxBounds', () => {
  it('image-up returns the box itself', () => {
    const s = 0.37;
    const at: [number, number] = [640.25, 301.5];
    expect(bounds([0, -1], s, at)).toEqual(
      [at[0] + -50 * s, at[1] + -18 * s, at[0] + 50 * s, at[1] + 2 * s].map(Math.fround),
    );
  });

  it('a quarter turn swaps width and height', () => {
    const [x0, y0, x1, y1] = bounds([-1, 0], 1, [200, 300]);
    expect(x1! - x0!).toBeCloseTo(20, 5);
    expect(y1! - y0!).toBeCloseTo(100, 5);
    // Up points left, so the ink's top edge (y = −18) is the left one.
    expect(x0).toBeCloseTo(200 - 18, 5);
    expect(y0).toBeCloseTo(300 - 50, 5);
  });

  it('a diagonal up bounds all four corners', () => {
    const h = Math.SQRT1_2;
    const [x0, y0, x1, y1] = bounds([-h, -h], 2, [0, 0]);
    // Corners turn to √½ · (x + y, y − x): x ± 50 with y in {−18, 2}.
    expect(x0).toBeCloseTo(2 * h * (-50 - 18), 4);
    expect(x1).toBeCloseTo(2 * h * (50 + 2), 4);
    expect(y0).toBeCloseTo(2 * h * (-18 - 50), 4);
    expect(y1).toBeCloseTo(2 * h * (2 + 50), 4);
  });
});
