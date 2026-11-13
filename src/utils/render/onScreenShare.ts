/** onScreenShare — the share (0..1) of an axis-aligned box (centre and half extents, px) inside the canvas. */

import type { Size } from '../../@types/rendering/Size';

export function onScreenShare(
  c: readonly [number, number],
  half: readonly [number, number],
  size: Size,
): number {
  const w = Math.max(0, Math.min(size.width, c[0] + half[0]) - Math.max(0, c[0] - half[0]));
  const h = Math.max(0, Math.min(size.height, c[1] + half[1]) - Math.max(0, c[1] - half[1]));
  return (w * h) / (4 * half[0] * half[1]);
}
