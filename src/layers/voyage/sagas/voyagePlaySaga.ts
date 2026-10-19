/**
 * voyagePlaySaga — play the trip in ship time from the current instant to arrival, and pause
 * there if this profile is still on the clock (`missionPlaySaga`'s contract: any visitor time
 * action drops the profile, and a late pause must not freeze a clock restarted since). The hold
 * cancels this saga on its next intent. `settleMs` holds the build back while a scrub arrives.
 */
import { delay, put, select } from 'typed-redux-saga';

import { JULIAN_YEAR_DAYS } from '../../../data/time/julianYearDays';
import { VOYAGE_DESTINATIONS } from '../../../data/voyage/voyageDestinations';
import { pause, startClockProfile } from '../../../state/time/timeSlice';
import { selectTimeState } from '../../../state/time/selectors';
import { tripOf } from '../../../utils/relativity/tripOf';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { buildVoyageProfile } from '../../../utils/voyage/buildVoyageProfile';
import { voyageTripLy } from '../../../utils/voyage/voyageTripLy';
import { selectRoute } from '../state/voyage/selectors';
import type { RootState } from '../../../store/types';

/** Run pressed within this of arrival plays the trip again from launch (run only, never − / +). */
const AT_END_DAYS = 1;

export function* voyagePlaySaga(
  speed: number,
  options: { readonly replayAtEnd: boolean; readonly settleMs: number },
): Generator {
  const { destination, launchDays } = yield* select(selectRoute);
  if (destination === null || launchDays === null) return;
  const at = deriveSimDays(yield* select(selectTimeState), performance.now());
  if (options.settleMs > 0) {
    yield* delay(options.settleMs);
    // A pause that lands in the settle window outranks the scrub that scheduled this.
    if ((yield* select(selectTimeState)).paused) return;
  }
  const trip = VOYAGE_DESTINATIONS[destination];
  const arrivalDays = launchDays + tripOf(voyageTripLy(trip)).tEarthTotalYr * JULIAN_YEAR_DAYS;
  const from = options.replayAtEnd && at >= arrivalDays - AT_END_DAYS ? launchDays : at;
  const nowMs = performance.now();
  const profile = buildVoyageProfile(trip, from, launchDays, speed, nowMs);
  yield* put(startClockProfile({ profile }));
  yield* delay(Math.max(0, profile.wallMs.at(-1)! - (performance.now() - nowMs)));
  const still = yield* select((s: RootState) => s.time.profile === profile);
  if (still) yield* put(pause({ nowMs: performance.now() }));
}
