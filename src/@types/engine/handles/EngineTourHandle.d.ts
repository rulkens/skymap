import type { BeatData } from '../../tour/BeatData';

/**
 * EngineTourHandle — programmatic guided-tour control surface.
 *
 * `start` dispatches TOUR_START fire-and-forget: it launches a new tour run
 * carrying the beat sequence and returns immediately. `watchTour`'s `takeLatest`
 * ensures a new start supersedes any in-progress run.
 *
 * `advance` dispatches TOUR_ADVANCE to skip the current beat's remaining dwell
 * and move to the next. It only has an effect during a beat's dwell phase (the
 * establishing fly is always awaited first); outside a dwell it is a harmless
 * no-op, so callers need not gate it on tour state.
 *
 * `exit` dispatches TOUR_EXIT to cancel an in-progress run. All restore logic
 * (settings + camera) lives in `guidedTour`'s `finally` block.
 */
export type EngineTourHandle = {
  start: (beats: readonly BeatData[]) => void;
  advance: () => void;
  exit: () => void;
};
