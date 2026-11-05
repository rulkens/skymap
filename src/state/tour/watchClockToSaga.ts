/**
 * watchClockToSaga — plays a `clockTo` cue on the sim clock. A timed move is a two-sample
 * `ClockProfile` from the instant it fires (the mission mechanism), paused at its end so the
 * TimeBar does not read "playing" over a held date. A snap pauses too: a profile leaves the
 * clock un-paused. The end-pause fires only if its profile is still on the clock — a newer
 * cue cancels it (takeLatest), and a tour exit's restored clock must not be frozen by it.
 */
import { delay, put, select, takeLatest } from 'typed-redux-saga';

import { clockTo } from './clockTo';
import { pause, setSimDays, startClockProfile } from '../time/timeSlice';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';

export function* watchClockToSaga(): Generator {
  yield* takeLatest(clockTo, function* ({ payload: { simDays, overSec } }) {
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
    yield* delay(overSec * 1000);
    if ((yield* select(selectTimeState)).profile === profile) {
      yield* put(pause({ nowMs: performance.now() }));
    }
  });
}
