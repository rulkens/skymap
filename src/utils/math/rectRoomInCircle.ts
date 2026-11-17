/**
 * rectRoomInCircle — how far a screen rect's farthest corner sits inside a circle's
 * edge, px: negative once a corner pokes out. A room, not a yes/no, so a caller can
 * fade over it.
 */

import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';

export function rectRoomInCircle(
  rect: ScreenRectPx,
  centre: Readonly<Vec2>,
  radius: number,
): number {
  const dx = Math.max(Math.abs(rect.x0 - centre[0]), Math.abs(rect.x1 - centre[0]));
  const dy = Math.max(Math.abs(rect.y0 - centre[1]), Math.abs(rect.y1 - centre[1]));
  return radius - Math.hypot(dx, dy);
}
