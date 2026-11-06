/**
 * easedClockProfile — a `ClockProfile` that moves the clock `fromDays` → `toDays` over `overMs`
 * along a camera-tween `Ease`, sampled once per 60 Hz frame (linear needs one segment). The last
 * sample is `toDays` itself, not `fromDays + 1·span`, so a run lands on its instant bit-exact.
 */
import type { Ease } from '../../@types/animation/Ease';
import type { ClockProfile } from '../../@types/time/ClockProfile';
import { EASE } from '../../services/engine/animation/ease';

const SAMPLE_MS = 1000 / 60;

export function easedClockProfile(
  fromDays: number,
  toDays: number,
  overMs: number,
  ease: Ease,
  startWallMs: number,
): ClockProfile {
  const segments = ease === 'linear' ? 1 : Math.ceil(overMs / SAMPLE_MS);
  const wallMs = new Float64Array(segments + 1);
  const simDays = new Float64Array(segments + 1);
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    wallMs[i] = t * overMs;
    simDays[i] = fromDays + EASE[ease](t) * (toDays - fromDays);
  }
  wallMs[segments] = overMs;
  simDays[segments] = toDays;
  return { startWallMs, wallMs, simDays };
}
