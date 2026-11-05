/**
 * watchClockToSaga — plays a `clockTo` cue on the sim clock. A timed move is a two-sample
 * `ClockProfile` from the instant it fires (the mission mechanism), held at its end. A snap
 * also pauses: a profile leaves the clock un-paused, and a snap must land and stay put.
 */
import { put, select, takeEvery } from 'typed-redux-saga';

import { clockTo } from './clockTo';
import { pause, setSimDays, startClockProfile } from '../time/timeSlice';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';

export function* watchClockToSaga(): Generator {
  yield* takeEvery(clockTo, function* ({ payload: { simDays, overSec } }) {
    const nowMs = performance.now();
    if (overSec === 0) {
      yield* put(setSimDays({ simDays, nowMs }));
      yield* put(pause({ nowMs }));
      return;
    }
    const from = deriveSimDays(yield* select(selectTimeState), nowMs);
    const profile = {
      startWallMs: nowMs,
      wallMs: Float64Array.of(0, overSec * 1000),
      simDays: Float64Array.of(from, simDays),
    };
    yield* put(startClockProfile({ profile }));
  });
}
