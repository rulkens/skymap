/**
 * tourActions — the reducer-less signals the guided-tour saga takes on.
 *
 * `startTour` launches a new tour run carrying the beat sequence. `watchTourSaga`
 * picks it up via `takeLatest` — a new start supersedes any in-progress run
 * automatically. The action is fully serializable (payload-only, no callbacks).
 *
 * `advanceTour` asks the tour to step to the next beat. It can come from a
 * keyboard shortcut, a UI button, or the auto-advance timer expiring inside
 * `visitBeatSaga`. The saga takes it with a race against the dwell timer so that
 * whichever fires first wins — user input or timeout.
 *
 * `exitTour` asks the saga to tear down the tour, restore pre-tour settings,
 * and stop the active clip. `advanceTour` and `exitTour` are reducer-less: they
 * carry no payload and modify no state; they are pure events consumed by the
 * saga.
 */
import { createAction } from '@reduxjs/toolkit';

import type { BeatData } from '../../@types/tour/BeatData';

export const startTour = createAction('tour/start', (beats: readonly BeatData[]) => ({
  payload: { beats },
}));

export const advanceTour = createAction('tour/advance');
export const exitTour = createAction('tour/exit');
