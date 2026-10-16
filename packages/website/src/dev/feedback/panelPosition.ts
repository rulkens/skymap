import type { FeedbackRect } from '../../../../../tools/site/@types/FeedbackRect';
import { clamp } from '../overlay/clamp';
import type { FeedbackPoint } from './@types/FeedbackPoint';

const GAP = 12;
const MARGIN = 8;

/** Where the note panel goes beside the area it is about: right of it, else left, else under, else above. */
export function panelPosition(
  area: FeedbackRect,
  panel: { width: number; height: number },
  view: { width: number; height: number },
): FeedbackPoint {
  let x = area.x + area.width + GAP;
  let y = area.y;
  if (x + panel.width > view.width - MARGIN) x = area.x - panel.width - GAP;
  if (x < MARGIN) {
    // Neither side has room (a phone, or a wide element): go under the area, else above it.
    x = area.x;
    y = area.y + area.height + GAP;
    if (y + panel.height > view.height - MARGIN) y = area.y - panel.height - GAP;
  }
  return {
    x: clamp(x, MARGIN, Math.max(MARGIN, view.width - panel.width - MARGIN)),
    y: clamp(y, MARGIN, Math.max(MARGIN, view.height - panel.height - MARGIN)),
  };
}
