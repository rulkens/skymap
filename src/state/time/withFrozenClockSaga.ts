/**
 * withFrozenClockSaga — the clock bracket a scripted takeover body runs in: pause the sim clock,
 * hand the body the instant it froze at, and give the clock back in `finally`. The instant is
 * derived at the SAME `nowMs` the `pause` re-anchors from, so it equals the sim time the clock
 * holds until the body moves it. A body may move it (a tour beat played alone fires `clockTo`),
 * so exit puts back the frozen instant, not wherever the clock got to: a playing live clock
 * re-snaps to the wall clock, any other returns to the frozen instant with its captured mode,
 * rate and pause, the tour snapshot's rule. Either put drops a still-running `clockTo` ease.
 */
import { put, select } from 'typed-redux-saga';

import { pause, restoreTime } from './timeSlice';
import { goLiveNowAction } from './goLiveNowAction';
import { selectTimeState } from './selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';

export function* withFrozenClockSaga<T>(
  body: (frozenSimDays: number) => Generator<unknown, T>,
): Generator<unknown, T> {
  const nowMs = performance.now();
  const prior = yield* select(selectTimeState);
  const frozenSimDays = deriveSimDays(prior, nowMs);
  yield* put(pause({ nowMs }));
  try {
    return yield* body(frozenSimDays);
  } finally {
    yield* put(
      prior.mode === 'live' && !prior.paused
        ? goLiveNowAction()
        : restoreTime({ captured: prior, simDays: frozenSimDays, nowMs: performance.now() }),
    );
  }
}
