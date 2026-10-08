import type { RideProfile } from '../../@types/time/RideProfile';

/** Sim days on a ride's table at wall time `nowMs`, held at the first and last sample outside it. */
export function interpolateRideProfile(profile: RideProfile, nowMs: number): number {
  const { wallMs, simDays } = profile;
  const last = wallMs.length - 1;
  const w = nowMs - profile.startWallMs;
  if (w <= wallMs[0]!) return simDays[0]!;
  if (w >= wallMs[last]!) return simDays[last]!;

  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (wallMs[mid]! <= w) lo = mid;
    else hi = mid;
  }
  const f = (w - wallMs[lo]!) / (wallMs[hi]! - wallMs[lo]!);
  return simDays[lo]! + f * (simDays[hi]! - simDays[lo]!);
}
