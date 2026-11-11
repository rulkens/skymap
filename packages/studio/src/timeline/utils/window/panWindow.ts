/** The window shifted by `deltaSec`, stopping at either end of the clip's fit window. */
import type { TimeWindow } from '../../../@types/session/TimeWindow';

export function panWindow(current: TimeWindow, fit: TimeWindow, deltaSec: number): TimeWindow {
  const span = current.endSec - current.startSec;
  const startSec = Math.min(Math.max(fit.startSec, current.startSec + deltaSec), fit.endSec - span);
  return { startSec, endSec: startSec + span };
}
