/**
 * withFrozenClockSaga — the clock bracket a scripted takeover body runs in: pause the sim clock,
 * hand the body the instant it froze at, and give the clock back in `finally`. The instant is
 * derived at the SAME `nowMs` the `pause` re-anchors from, so it equals the sim time the clock
 * holds for the whole body. Exit restores what the body interrupted: live re-snaps to the wall
 * clock, a playing manual clock resumes, and a paused one stays paused, since `pause` only
 * re-anchored it, which moves no sim time.
 */
import { put, select } from 'typed-redux-saga';

import { pause, resume } from './timeSlice';
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
    if (prior.mode === 'live') {
      yield* put(goLiveNowAction());
    } else if (!prior.paused) {
      yield* put(resume({ nowMs: performance.now() }));
    }
  }
}
