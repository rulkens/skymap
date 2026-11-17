/** rectMeetsCircle — whether a screen rect and a circle share any pixel: the rect's nearest point lies inside. */

import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';

export function rectMeetsCircle(
  rect: ScreenRectPx,
  centre: Readonly<Vec2>,
  radius: number,
): boolean {
  const dx = centre[0] - Math.min(Math.max(centre[0], rect.x0), rect.x1);
  const dy = centre[1] - Math.min(Math.max(centre[1], rect.y0), rect.y1);
  return dx * dx + dy * dy < radius * radius;
}
