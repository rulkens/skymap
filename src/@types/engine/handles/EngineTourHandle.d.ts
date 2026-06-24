import type { BeatData } from '../../tour/BeatData';

/**
 * EngineTourHandle — programmatic guided-tour control surface.
 *
 * `start` dispatches TOUR_START and returns a Promise that resolves when the
 * tour ends — either all beats complete naturally or TOUR_EXIT cancels the run.
 * The Promise always resolves (never rejects), so `await engine.tour.start(...)`
 * is safe without a try/catch.
 *
 * `exit` dispatches TOUR_EXIT to cancel an in-progress run. The Promise
 * returned by the matching `start` call resolves in the same microtask via
 * the `finally` hook in `watchTour`.
 */
export type EngineTourHandle = {
  start: (beats: readonly BeatData[]) => Promise<void>;
  exit: () => void;
};
