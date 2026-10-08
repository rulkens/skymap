/**
 * rideSaga — one flyby ride: frame the encounter, play the clock profile, and pause at its end.
 * The pause is conditional on the profile still being on the clock: any visitor time action drops
 * it, and a delayed pause must not freeze a clock the visitor has since started again. The hold
 * loop cancels this saga on the next step, so a superseded ride's timer never fires.
 */
import { delay, put, select } from 'typed-redux-saga';

import { RIDE_WALL_MS } from '../../data/exhibits/ride/rideWallMs';
import { buildRideProfile } from '../../utils/exhibits/ride/buildRideProfile';
import { flybyNormal } from '../../utils/exhibits/ride/flybyNormal';
import { clearRide, setRide } from '../camera/cameraSlice';
import { pause, startRide } from '../time/timeSlice';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
import type { RootState } from '../../store/types';

export function* rideSaga(event: MissionEvent): Generator {
  const nowMs = performance.now();
  const profile = buildRideProfile(event, nowMs);
  const normal = flybyNormal(event);
  if (profile === null || normal === null || event.targetId === undefined) {
    // Track not loaded: there is nothing to frame, and a stale ride must not linger.
    yield* put(clearRide());
    return;
  }
  yield* put(
    setRide({
      eventId: event.id,
      craftId: event.bodyId,
      targetId: event.targetId,
      closestKm: event.closestKm!,
      normal,
      offsets: { yaw: 0, pitch: 0, zoom: 1 },
    }),
  );
  yield* put(startRide({ profile, nowMs }));
  yield* delay(Math.max(0, RIDE_WALL_MS - (performance.now() - nowMs)));
  const stillPlaying = yield* select((s: RootState) => s.time.profile !== null);
  if (stillPlaying) yield* put(pause({ nowMs: performance.now() }));
}
