import type { FeedbackRect } from '../../../../../tools/site/@types/FeedbackRect';
import type { Viewport } from '../overlay/@types/Viewport';

/** A page-coordinates rectangle where it sits in the window now; `window` itself will do as the scroll. */
export function viewRect(
  r: FeedbackRect,
  scroll: Pick<Viewport, 'scrollX' | 'scrollY'>,
): FeedbackRect {
  return { ...r, x: r.x - scroll.scrollX, y: r.y - scroll.scrollY };
}
