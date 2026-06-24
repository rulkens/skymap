/**
 * tourActions — the reducer-less signals the guided-tour saga takes on.
 *
 * `TOUR_START` launches a new tour run. It carries the beat sequence and a
 * completion callback so the engine handle can return a Promise that resolves
 * when the run ends (natural completion or TOUR_EXIT cancellation). The
 * non-serializable `onDone` lives in `meta` — acceptable for an engine-internal
 * control action that is never persisted or replayed. `watchTour` picks up
 * TOUR_START via `takeLatest`, cancelling any prior run automatically.
 *
 * `TOUR_ADVANCE` asks the tour to step to the next beat. It can come from a
 * keyboard shortcut, a UI button, or the auto-advance timer expiring inside
 * `visitBeat`. The saga takes it with a race against the dwell timer so that
 * whichever fires first wins — user input or timeout.
 *
 * `TOUR_EXIT` asks the saga to tear down the tour, restore pre-tour settings,
 * and stop the active clip. TOUR_ADVANCE and TOUR_EXIT are reducer-less: they
 * carry no payload and modify no state; they are pure events consumed by the
 * saga.
 */
import { createAction } from '@reduxjs/toolkit';

import type { BeatData } from '../../@types/tour/BeatData';

export const TOUR_START = createAction(
  'tour/start',
  (beats: readonly BeatData[], onDone: () => void) => ({ payload: { beats }, meta: { onDone } }),
);

export const TOUR_ADVANCE = createAction('tour/advance');
export const TOUR_EXIT = createAction('tour/exit');
