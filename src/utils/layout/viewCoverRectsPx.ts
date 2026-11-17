import type { CoverId } from '../../@types/layout/CoverId';
import type { ViewCover } from '../../@types/layout/ViewCover';
import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';
import { viewCoverRect } from './viewCoverRect';

/**
 * Every open panel's rect on a `viewportPx` canvas in device px: covers are
 * measured in CSS px against the window, `cssWidth` wide, which the canvas fills.
 */
export function viewCoverRectsPx(
  covers: Readonly<Partial<Record<CoverId, ViewCover>>>,
  viewportPx: Readonly<Vec2>,
  cssWidth: number,
): ScreenRectPx[] {
  const scale = viewportPx[0] / cssWidth;
  const css: Vec2 = [cssWidth, viewportPx[1] / scale];
  return Object.values(covers).map((cover) => {
    const r = viewCoverRect(cover!, css);
    return { x0: r.x0 * scale, y0: r.y0 * scale, x1: r.x1 * scale, y1: r.y1 * scale };
  });
}
