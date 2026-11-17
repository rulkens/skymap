/**
 * nextSunBelowAt — the first instant within 24 h at which the Sun is at or
 * below `altitudeRad`: sampled every 5 minutes, then bisected to well under a
 * second. `simDays` itself when it already is; null when it is not within the
 * day (a white night).
 */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { sunAltitudeAt } from './sunAltitudeAt';

const STEP_DAYS = 5 / 1440;
const BISECTIONS = 20;

export function nextSunBelowAt(spot: SkySpot, simDays: number, altitudeRad: number): number | null {
  const below = (t: number): boolean => sunAltitudeAt(spot, t) <= altitudeRad;
  if (below(simDays)) return simDays;
  for (let t = simDays; t < simDays + 1; t += STEP_DAYS) {
    const next = t + STEP_DAYS;
    if (!below(next)) continue;
    let lo = t;
    let hi = next;
    for (let i = 0; i < BISECTIONS; i++) {
      const mid = (lo + hi) / 2;
      if (below(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return null;
}
