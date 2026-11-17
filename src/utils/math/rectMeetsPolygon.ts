/**
 * rectMeetsPolygon — whether a screen rect and a simple polygon (its outline, in order)
 * share any pixel: a polygon vertex in the rect, the rect's centre in the polygon, or
 * an outline edge crossing a rect edge.
 */

import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';
import { segmentsCross } from './segmentsCross';

export function rectMeetsPolygon(rect: ScreenRectPx, outline: readonly Readonly<Vec2>[]): boolean {
  const inRect = ([x, y]: Readonly<Vec2>) =>
    x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
  if (outline.some(inRect)) return true;
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const sides: [Vec2, Vec2][] = [
    [
      [rect.x0, rect.y0],
      [rect.x1, rect.y0],
    ],
    [
      [rect.x1, rect.y0],
      [rect.x1, rect.y1],
    ],
    [
      [rect.x1, rect.y1],
      [rect.x0, rect.y1],
    ],
    [
      [rect.x0, rect.y1],
      [rect.x0, rect.y0],
    ],
  ];
  let inside = false;
  for (let k = 0; k < outline.length; k += 1) {
    const a = outline[k]!;
    const b = outline[(k + 1) % outline.length]!;
    // Even-odd crossing of a ray running right from the rect's centre.
    if (a[1] > cy !== b[1] > cy && cx < a[0] + ((cy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
      inside = !inside;
    if (sides.some(([p, q]) => segmentsCross(a, b, p, q))) return true;
  }
  return inside;
}
