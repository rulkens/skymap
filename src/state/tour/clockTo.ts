/**
 * clockTo — a tour beat moves the sim clock to `simDays` (Julian days) over `overSec` real
 * seconds; 0 snaps. Rides the `scene()` cue verbatim, played by `watchClockToSaga`.
 * The type stays off the `time/` route: the time slice drops a running profile on any
 * `time/*` action, which would include this one's own.
 */
import { createAction } from '@reduxjs/toolkit';

export const clockTo = createAction<{ simDays: number; overSec: number }>('tour/clockTo');
