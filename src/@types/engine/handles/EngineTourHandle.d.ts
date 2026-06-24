import type { BeatData } from '../../tour/BeatData';

/**
 * EngineTourHandle — programmatic guided-tour control surface.
 *
 * `start` dispatches TOUR_START fire-and-forget: it launches a new tour run
 * carrying the beat sequence and returns immediately. `watchTour`'s `takeLatest`
 * ensures a new start supersedes any in-progress run.
 *
 * `exit` dispatches TOUR_EXIT to cancel an in-progress run. All restore logic
 * (settings + camera) lives in `guidedTour`'s `finally` block.
 */
export type EngineTourHandle = {
  start: (beats: readonly BeatData[]) => void;
  exit: () => void;
};
