/** Where a time sits across the visible window, in percent of the track width (outside 0-100 when off-screen). */
import type { TimeWindow } from '../../@types/session/TimeWindow';

export function timeToPercent(sec: number, window: TimeWindow): number {
  return ((sec - window.startSec) / (window.endSec - window.startSec)) * 100;
}
