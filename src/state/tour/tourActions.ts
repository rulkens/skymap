/**
 * tourActions — the reducer-less signals `tourBodySaga` takes on.
 *
 * `startTour(id, beats?)` launches a new tour run by its `TourId`, optionally
 * windowed to a contiguous `BeatRange` — the recorder hook passes one so a
 * single-beat take doesn't replay the whole tour; omitted means the full run.
 * `watchTakeoverSaga` picks it up via `takeLatest` — a new start supersedes any
 * in-progress takeover automatically — looks the id up in `tourRegistry`, and
 * runs `tourBodySaga` on the resolved tour under `runTakeoverSaga`. The action is
 * fully serializable (an id plus a plain index range, no callbacks).
 *
 * `advanceTour` asks the tour to step to the next beat. It can come from a
 * keyboard shortcut, a UI button, or the auto-advance timer expiring inside
 * `visitBeatSaga`. The saga takes it with a race against the dwell timer so that
 * whichever fires first wins — user input or timeout.
 *
 * `prevBeat` asks the tour to step BACK one beat (clamped at the first). It is
 * the mirror of `advanceTour` and, like it, is raced against the dwell timer in
 * `visitBeatSaga`; the saga returns a `'prev'` outcome so the outer loop
 * decrements its index and re-plays the previous beat's establishing fly.
 *
 * `togglePause` flips the dwell countdown between running and frozen. The saga
 * owns the real pause (it freezes the remaining dwell and parks until the next
 * `togglePause`) and writes the `paused` flag to the slice — the action itself
 * stays reducer-less so the flag can never drift from the saga's actual state.
 *
 * Tearing a tour down (restoring pre-tour settings, stopping the active clip)
 * is `exitTakeover` now (`state/takeover/takeoverActions.ts`) — a tour isn't
 * the only thing it can end, so it moved out of this tour-specific file.
 * These three signals are reducer-less: they carry no payload and modify no
 * state; they are pure events consumed by `tourBodySaga`, the single writer of
 * the `tour` slice.
 */
import { createAction } from '@reduxjs/toolkit';

import type { TourId } from '../../@types/animation/tour/TourId';
import type { BeatRange } from '../../@types/animation/tour/BeatRange';

export const startTour = createAction('tour/start', (id: TourId, beats?: BeatRange) => ({
  payload: { id, beats },
}));

export const advanceTour = createAction('tour/advance');
export const prevBeat = createAction('tour/prev');
export const togglePause = createAction('tour/togglePause');
