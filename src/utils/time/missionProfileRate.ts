import type { MissionProfile } from '../../@types/time/MissionProfile';

/** Sim seconds per wall second on the mission table's segment at wall time `nowMs`; 0 outside it. */
export function missionProfileRate(profile: MissionProfile, nowMs: number): number {
  const { wallMs, simDays } = profile;
  const last = wallMs.length - 1;
  const w = nowMs - profile.startWallMs;
  if (last < 1 || w < wallMs[0]! || w >= wallMs[last]!) return 0;

  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (wallMs[mid]! <= w) lo = mid;
    else hi = mid;
  }
  return ((simDays[hi]! - simDays[lo]!) * 86_400) / ((wallMs[hi]! - wallMs[lo]!) / 1000);
}
