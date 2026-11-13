/**
 * nextRiseAt — the first instant within `horizonDays` at which a target climbs
 * through the horizon (altitude 0, no refraction): sampled every 20 minutes then
 * bisected to about a millisecond. A target already up is waited out until it has
 * set and risen again; null when no rise falls inside the horizon. Each sample
 * derives the body states once and places host and target from that one map.
 */

import type { BodyState } from '../../@types/scene/BodyState';
import type { PositionedId } from '../../@types/scene/PositionedId';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { altAzFromSpot } from './altAzFromSpot';

const STEP_DAYS = 20 / 1440;
const BISECTIONS = 20;

export function nextRiseAt(
  spot: SkySpot,
  simDays: number,
  targetAt: (bodies: ReadonlyMap<PositionedId, BodyState>) => Vec3,
  horizonDays: number,
): number | null {
  const up = (t: number): boolean => {
    const bodies = deriveBodyStates(t);
    return altAzFromSpot(spot, targetAt(bodies), bodies).altitudeRad >= 0;
  };
  let wasUp = up(simDays);
  const end = simDays + horizonDays;
  for (let t = simDays; t < end; t += STEP_DAYS) {
    const next = Math.min(t + STEP_DAYS, end);
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
