import type { ClockProfile } from '../../@types/time/ClockProfile';

const SAMPLES = 48;

/**
 * A scripted clock easing (smoothstep) from `fromSimDays` to `toSimDays` over `durationMs`.
 * Forward only: the sim column must ascend for `deriveSimDays`, so a target at or before
 * `from` is the caller's to jump to instead.
 */
export function easedClockProfile(
  fromSimDays: number,
  toSimDays: number,
  startWallMs: number,
  durationMs: number,
): ClockProfile {
  const wallMs = new Float64Array(SAMPLES);
  const simDays = new Float64Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    wallMs[i] = t * durationMs;
    simDays[i] = fromSimDays + (toSimDays - fromSimDays) * t * t * (3 - 2 * t);
  }
  return { startWallMs, wallMs, simDays };
}
