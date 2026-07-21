/**
 * Time selectors — the single read seam for the RTK time slice, scoped through
 * `RootState`.
 *
 * One consolidated module (the spec's override of the one-function-per-file rule
 * for selectors), mirroring the engine/tier slices' base + leaf pattern:
 *
 *  - `selectTimeState` is the base selector — it lifts the slice out of
 *    `RootState` via `state[timeRoute]`, naming the route exactly once.
 *  - `selectRateStep` reads the current ladder detent. Under
 *    `noUncheckedIndexedAccess` an out-of-range index yields `undefined`, so the
 *    return type carries that possibility honestly rather than asserting non-null
 *    — a valid `rateIndex` is the writer's responsibility (the reducers only ever
 *    set it from a payload).
 *  - `selectIsManualPlaying` is the wake predicate's read (Task 9): true only when
 *    a manual clock is actively advancing, so the render loop can stay asleep in
 *    live/paused states where nothing on the intent side moves.
 *
 * Every selector is `RootState`-scoped so the same function works unchanged on
 * BOTH the React side (`useAppSelector(selectX)`) and the engine side
 * (`selectX(store.getState())`). No react-redux import — `src/state/` is
 * framework-agnostic.
 */

import { timeRoute } from '../../store/constants';
import { RATE_LADDER } from '../../data/time/rateLadder';
import type { RootState } from '../../store/types';
import type { TimeState } from '../../@types/time/TimeState';
import type { RateLadderStep } from '../../@types/time/RateLadderStep';

export const selectTimeState = (state: RootState): TimeState => state[timeRoute];

export const selectRateStep = (state: RootState): RateLadderStep | undefined =>
  RATE_LADDER[selectTimeState(state).rateIndex];

export const selectIsManualPlaying = (state: RootState): boolean => {
  const time = selectTimeState(state);
  return time.mode === 'manual' && !time.paused;
};
