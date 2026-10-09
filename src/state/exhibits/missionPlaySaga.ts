/**
 * missionPlaySaga — play the mission profile from the current instant to now, and pause at its
 * end. The pause is conditional on this profile still being on the clock: any visitor time
 * action drops it, and a delayed pause must not freeze a clock the visitor has since started
 * again. The hold loop cancels this saga on its next intent, so a superseded timer never fires.
 * `settleMs` holds the build back while a scrub stream is still arriving.
 */
import { delay, put, select } from 'typed-redux-saga';

import { buildMissionProfile } from '../../utils/exhibits/mission/buildMissionProfile';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import { pause, startMissionProfile } from '../time/timeSlice';
import { selectTimeState } from '../time/selectors';
import type { CameraMission } from '../../@types/camera/CameraMission';
import type { RootState } from '../../store/types';

/** Run pressed within this of the end plays the mission again from launch (run only, never − / +). */
const AT_END_DAYS = 1;

export function* missionPlaySaga(
  mission: CameraMission,
  speedIndex: number,
  options: { readonly replayAtEnd: boolean; readonly settleMs: number },
): Generator {
  const endDays = unixMsToJulianDays(Date.now());
  const at = deriveSimDays(yield* select(selectTimeState), performance.now());
  if (options.settleMs > 0) {
    yield* delay(options.settleMs);
    // A pause that lands in the settle window outranks the scrub that scheduled this.
    if ((yield* select(selectTimeState)).paused) return;
  }
  const from =
    options.replayAtEnd && at >= endDays - AT_END_DAYS
      ? unixMsToJulianDays(mission.stops[0]!.ms)
      : at;
  const nowMs = performance.now();
  const profile = buildMissionProfile(
    mission.stops,
    mission.craftId,
    from,
    endDays,
    speedIndex,
    nowMs,
  );
  yield* put(startMissionProfile({ profile }));
  yield* delay(Math.max(0, profile.wallMs.at(-1)! - (performance.now() - nowMs)));
  const still = yield* select((s: RootState) => s.time.profile === profile);
  if (still) yield* put(pause({ nowMs: performance.now() }));
}
