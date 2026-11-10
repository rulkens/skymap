/** The viewport after zooming the drawn window by `factor` about `anchorSec`; null is Fit. */
import { viewWindow } from './viewWindow';
import { zoomWindow } from './zoomWindow';
import type { Timeline } from '../../../@types/rows/Timeline';
import type { TimeWindow } from '../../../@types/session/TimeWindow';

export function zoomedViewport(
  viewport: TimeWindow | null,
  timeline: Timeline,
  factor: number,
  anchorSec: number,
): TimeWindow | null {
  return zoomWindow(viewWindow(viewport, timeline), viewWindow(null, timeline), factor, anchorSec);
}
