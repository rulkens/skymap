/**
 * tourActions — the two reducer-less signals the guided-tour saga takes on.
 *
 * `TOUR_ADVANCE` asks the tour to step to the next beat. It can come from a
 * keyboard shortcut, a UI button, or the auto-advance timer expiring inside
 * `visitBeat`. The saga takes it with a race against the dwell timer so that
 * whichever fires first wins — user input or timeout.
 *
 * `TOUR_EXIT` asks the saga to tear down the tour, restore pre-tour settings,
 * and stop the active clip. Both signals are reducer-less: they carry no
 * payload and modify no state; they are pure events consumed by the saga.
 */
import { createAction } from '@reduxjs/toolkit';

export const TOUR_ADVANCE = createAction('tour/advance');
export const TOUR_EXIT = createAction('tour/exit');
