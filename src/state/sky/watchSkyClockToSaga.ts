/**
 * watchSkyClockToSaga — play `skyClockTo` as an eased clock profile from the clock's reading now,
 * then land paused exactly on the target. The landing is conditional on the profile still being
 * on the clock: any visitor time action drops it, and must not be frozen by a late landing.
 */
import { delay, put, select, takeLatest } from 'typed-redux-saga';

import { skyClockTo } from './skyClockTo';
import { SKY_CLOCK_SKIP_MS } from '../../data/sky/skyClockSkipMs';
import { selectTimeState } from '../time/selectors';
import { startClockProfile } from '../time/timeSlice';
import { manualPausedAtActions } from '../time/enterManualPausedAt';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { easedClockProfile } from '../../utils/time/easedClockProfile';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import type { RootState } from '../../store/types';

export function* watchSkyClockToSaga() {
  yield* takeLatest(skyClockTo, function* ({ payload }) {
    const nowMs = performance.now();
    const from = deriveSimDays(yield* select(selectTimeState), nowMs);
    const profile = easedClockProfile(from, payload.simDays, nowMs, SKY_CLOCK_SKIP_MS);
    yield* put(startClockProfile({ profile }));
    yield* delay(SKY_CLOCK_SKIP_MS);
    if (yield* select((s: RootState) => s.time.profile === profile)) {
      for (const action of manualPausedAtActions(new Date(julianDaysToUnixMs(payload.simDays)))) {
        yield* put(action);
      }
    }
  });
}
