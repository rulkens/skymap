/**
 * The dome's clock as the phone can run it: the status's instant becomes the anchor, stamped with
 * the phone's own `performance.now()` at arrival, so `deriveSimDays` ticks it on between statuses.
 * The dome sends a status only when its store changes, and a running clock is not a change.
 */

import type { DomeStatus } from '../../@types/remote/DomeStatus';
import type { TimeState } from '../../@types/time/TimeState';

export function domeClockFromStatus(time: DomeStatus['time'], receivedMs: number): TimeState {
  const { simDays, ...intent } = time;
  return { ...intent, anchor: { simDays, realMs: receivedMs }, profile: null };
}
