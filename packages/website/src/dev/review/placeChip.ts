import { clamp } from '../overlay/clamp';
import type { FeedbackPoint } from '../feedback/@types/FeedbackPoint';
import type { ChipAnchor } from './@types/ChipAnchor';

const GAP = 8;
const MARGIN = 8;

/**
 * Where the selection chip goes, in the window: just under the selection's last line, starting at its
 * end; above the first line when the free band has no room below; clamped into the band otherwise.
 * `view.top` and `view.bottom` bound the band the page's own bars leave free.
 */
export function placeChip(
  anchor: ChipAnchor,
  chip: { width: number; height: number },
  view: { width: number; top: number; bottom: number },
): FeedbackPoint {
  const below = anchor.last.y + anchor.last.height + GAP;
  const above = anchor.first.y - GAP - chip.height;
  const fitsBelow = below + chip.height <= view.bottom - MARGIN;
  const useAbove = !fitsBelow && above >= view.top + MARGIN;
  const x = useAbove ? anchor.first.x : anchor.last.x + anchor.last.width;
  const y = useAbove ? above : below;
  return {
    x: clamp(x, MARGIN, Math.max(MARGIN, view.width - chip.width - MARGIN)),
    y: clamp(y, view.top + MARGIN, Math.max(view.top + MARGIN, view.bottom - chip.height - MARGIN)),
  };
}
