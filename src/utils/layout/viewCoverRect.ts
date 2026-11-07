import type { ViewCover } from '../../@types/layout/ViewCover';
import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';

/** The panel's rect on a `canvasPx` = [width, height] canvas, in CSS px (not device px) with +Y down. */
export function viewCoverRect(cover: ViewCover, canvasPx: Readonly<Vec2>): ScreenRectPx {
  const [w, h] = canvasPx;
  const { reachPx } = cover;
  const [a, b] = cover.spanPx;
  switch (cover.edge) {
    case 'left':
      return { x0: 0, y0: a, x1: reachPx, y1: b };
    case 'right':
      return { x0: w - reachPx, y0: a, x1: w, y1: b };
    case 'top':
      return { x0: a, y0: 0, x1: b, y1: reachPx };
    case 'bottom':
      return { x0: a, y0: h - reachPx, x1: b, y1: h };
  }
}
