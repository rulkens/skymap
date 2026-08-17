/**
 * stepRate — advance the playback-rate detent by `delta`, clamped to the ends
 * of `RATE_LADDER`.
 *
 * The rate ladder is a fixed table with no wraparound, so stepping past either
 * end holds at that end. Reads the current `rateIndex` from the time slice and
 * returns the next index; the caller decides how to apply it (dispatch a
 * `setRate`). Pure, `RootState`-scoped so both the React and engine sides can
 * call it.
 */

import { RATE_LADDER } from '../../data/time/rateLadder';
import { selectTimeState } from '../../state/time/selectors';
import type { RootState } from '../../store/types';

export const stepRate = (state: RootState, delta: number): number => {
  const current = selectTimeState(state).rateIndex;
  return Math.min(Math.max(current + delta, 0), RATE_LADDER.length - 1);
};
