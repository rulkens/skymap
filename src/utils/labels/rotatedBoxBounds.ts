/**
 * rotatedBoxBounds — the axis-aligned bounds of a label's ink box once it is turned to stand
 * along `up`, as the label shader turns each glyph corner (`expandRecordGlyph`):
 * `cornerPx = at + (across × x − up × y) × scale`, `across = (−up.y, up.x)`. Declutter and pick
 * judge these bounds, so a label on a diagonal claims a little more room than its ink.
 */

import type { Vec2 } from '../../@types/math/Vec2';

/** Axis-aligned bounds of `box` (x0, y0, x1, y1 around the origin, image y down) turned so
 *  its up edge faces `up`, then moved to `at`; written into `out` at `outAt`. */
export function rotatedBoxBounds(
  box: ArrayLike<number>,
  boxAt: number,
  scale: number,
  up: Readonly<Vec2>,
  at: Readonly<Vec2>,
  out: Float32Array,
  outAt: number,
): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let corner = 0; corner < 4; corner++) {
    const x = box[boxAt + (corner & 1) * 2]!;
    const y = box[boxAt + (corner >> 1) * 2 + 1]!;
    // With image-up (0, −1) these are exactly `at + (x, y) × scale`: mono's rect is unchanged.
    const cornerX = at[0] + (-up[1] * x - up[0] * y) * scale;
    const cornerY = at[1] + (up[0] * x - up[1] * y) * scale;
    minX = Math.min(minX, cornerX);
    minY = Math.min(minY, cornerY);
    maxX = Math.max(maxX, cornerX);
    maxY = Math.max(maxY, cornerY);
  }
  out[outAt] = minX;
  out[outAt + 1] = minY;
  out[outAt + 2] = maxX;
  out[outAt + 3] = maxY;
}
