/**
 * nextRiseAt — the first instant within `horizonDays` at which a target climbs
 * through the horizon (altitude 0, no refraction): sampled every 5 minutes then
 * bisected. A target already up is waited out until it has set and risen again;
 * null when no rise falls inside the horizon.
 */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import { altAzFromSpot } from './altAzFromSpot';

const STEP_DAYS = 5 / 1440;
const BISECTIONS = 20;

export function nextRiseAt(
  spot: SkySpot,
  simDays: number,
  targetAt: (simDays: number) => Vec3,
  horizonDays: number,
): number | null {
  const up = (t: number): boolean => altAzFromSpot(spot, targetAt(t), t).altitudeRad >= 0;
  let wasUp = up(simDays);
  for (let t = simDays; t < simDays + horizonDays; t += STEP_DAYS) {
    const next = t + STEP_DAYS;
    const isUp = up(next);
    if (isUp && !wasUp) {
      let lo = t;
      let hi = next;
      for (let i = 0; i < BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (up(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    wasUp = isUp;
  }
  return null;
}
