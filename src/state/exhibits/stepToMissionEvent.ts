import { createAction } from '@reduxjs/toolkit';

/**
 * A visitor stepping to a chapter (button, dot, key), as opposed to dragging the scrubber.
 * The time slice lands the clock on the event; `nowMs` is stamped by the caller because
 * reducers never read a clock.
 */
export const stepToMissionEvent = createAction<{ eventId: string; nowMs: number }>(
  'exhibits/stepToMissionEvent',
);
