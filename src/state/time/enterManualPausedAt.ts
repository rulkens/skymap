/**
 * enterManualPausedAt — land the sim clock in MANUAL mode, PAUSED, at a chosen
 * instant. The one named operation behind "restore a shared `t=` URL" and "a
 * date-entry popover commit": both want the clock to jump to a moment and freeze
 * there, not resume playing.
 *
 * ### The shared-`nowMs` invariant, documented once
 *
 * `setSimDays` pins the anchor's `realMs` to the `nowMs` it is handed; `pause`'s
 * re-anchor then derives from that same `realMs`. Sampling `performance.now()`
 * ONCE here and threading it through both dispatches means `pause` sees zero
 * elapsed real time and holds the exact instant (`deriveSimDays(now) === instant`).
 * Two separate `performance.now()` reads would drift the paused value by the
 * inter-call gap. Sampling inside this helper — rather than taking `nowMs` as a
 * parameter — makes that invariant structurally impossible for a caller to break.
 *
 * A thin dispatch orchestrator, not a reducer: it reads a clock (`performance.now`)
 * and fires two actions, so it lives beside the slice rather than inside it (the
 * slice stays a pure function of intent, taking `nowMs` in every payload).
 */

import type { AppDispatch } from '../../store/types';
import { setSimDays, pause } from './timeSlice';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';

export function enterManualPausedAt(dispatch: AppDispatch, instant: Date): void {
  const nowMs = performance.now();
  dispatch(setSimDays({ simDays: unixMsToJulianDays(instant.getTime()), nowMs }));
  dispatch(pause({ nowMs }));
}
