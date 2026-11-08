import type { ScreenDiscPx } from '../../@types/rendering/ScreenDiscPx';
import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';

/** How much of a rect a disc covers, px², counted on an `n`×`n` grid of the rect's cell centres. */
export function rectDiscOverlapArea(rect: ScreenRectPx, disc: ScreenDiscPx, n = 8): number {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const r2 = disc.radius * disc.radius;
  let inside = 0;
  for (let i = 0; i < n; i++) {
    const dx = rect.x0 + ((i + 0.5) / n) * w - disc.centre[0];
    for (let j = 0; j < n; j++) {
      const dy = rect.y0 + ((j + 0.5) / n) * h - disc.centre[1];
      if (dx * dx + dy * dy < r2) inside++;
    }
  }
  return (inside / (n * n)) * w * h;
}
