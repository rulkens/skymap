/** rectInsideCircle — whether all four corners of a screen rect lie within a circle. */

import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';

export function rectInsideCircle(
  rect: ScreenRectPx,
  centre: Readonly<Vec2>,
  radius: number,
): boolean {
  const r2 = radius * radius;
  for (const x of [rect.x0, rect.x1]) {
    for (const y of [rect.y0, rect.y1]) {
      if ((x - centre[0]) ** 2 + (y - centre[1]) ** 2 > r2) return false;
    }
  }
  return true;
}
