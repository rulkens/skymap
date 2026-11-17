/**
 * offScreen — whether a box (centre and half extents, px) lies wholly outside
 * the canvas, judged by its circumscribed circle so a turned box is never
 * dropped early.
 */

import type { Size } from '../../@types/rendering/Size';

export function offScreen(
  c: readonly [number, number],
  half: readonly [number, number],
  size: Size,
): boolean {
  const r = Math.hypot(half[0], half[1]);
  return c[0] + r < 0 || c[1] + r < 0 || c[0] - r > size.width || c[1] - r > size.height;
}
