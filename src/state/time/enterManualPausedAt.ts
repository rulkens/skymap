/**
 * manualPausedAtActions — land the sim clock in MANUAL mode, PAUSED, at a chosen
 * instant, expressed as the pair of actions that do it. The one named operation
 * behind "restore a shared `t=` URL" and "a date-entry popover commit": both want
 * the clock to jump to a moment and freeze there, not resume playing.
 *
 * ### The shared-`nowMs` invariant, documented once
 *
 * `setSimDays` pins the anchor's `realMs` to the `nowMs` it is handed; `pause`'s
 * re-anchor then derives from that same `realMs`. Sampling `performance.now()`
 * ONCE here and threading it through both payloads means `pause` sees zero
 * elapsed real time and holds the exact instant (`deriveSimDays(now) === instant`).
 * Two separate `performance.now()` reads would drift the paused value by the
 * inter-call gap. Sampling inside the builder — rather than taking `nowMs` as a
 * parameter — makes that invariant structurally impossible for a caller to break.
 *
 * ### The builder is the artifact; the dispatcher is a wrapper
 *
 * Actions returned compose everywhere: a saga `put`s them, a URL hash-param row
 * hands them back for its caller to dispatch, a test reads their payloads with no
 * store at all. Only call sites that already hold a `dispatch` — the date-entry
 * popover — want the imperative spelling, so that is the thin wrapper rather than
 * the other way round.
 *
 * Neither is a reducer: the sample of `performance.now()` is a clock read, so this
 * lives beside the slice rather than inside it (the slice stays a pure function of
 * intent, taking `nowMs` in every payload).
 */

import type { Action } from '@reduxjs/toolkit';

import type { AppDispatch } from '../../store/types';
import { setSimDays, pause } from './timeSlice';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';

export function manualPausedAtActions(instant: Date): readonly Action[] {
  const nowMs = performance.now();
  return [setSimDays({ simDays: unixMsToJulianDays(instant.getTime()), nowMs }), pause({ nowMs })];
}

export function enterManualPausedAt(dispatch: AppDispatch, instant: Date): void {
  for (const action of manualPausedAtActions(instant)) dispatch(action);
}
