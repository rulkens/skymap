/**
 * tonightAt — where "Skip to tonight" lands (spec D6): the next moment the Sun is 18° down, or,
 * on a white night that never gets that dark, the Sun's lowest point in the next 24 h (5-minute
 * scan, then a 1-minute scan around the best sample).
 */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { nextSunBelowAt } from './nextSunBelowAt';
import { sunAltitudeAt } from './sunAltitudeAt';
import { degToRad } from '../math/degToRad';

const ASTRONOMICAL_DARK_RAD = degToRad(-18);
const COARSE_DAYS = 5 / 1440;
const FINE_DAYS = 1 / 1440;

export function tonightAt(spot: SkySpot, simDays: number): number {
  const dark = nextSunBelowAt(spot, simDays, ASTRONOMICAL_DARK_RAD);
  if (dark !== null) return dark;
  let best = { t: simDays, alt: Infinity };
  const scan = (from: number, to: number, step: number) => {
    for (let t = from; t <= to; t += step) {
      const alt = sunAltitudeAt(spot, t);
      if (alt < best.alt) best = { t, alt };
    }
  };
  scan(simDays, simDays + 1, COARSE_DAYS);
  const coarse = best.t;
  scan(coarse - COARSE_DAYS, coarse + COARSE_DAYS, FINE_DAYS);
  return best.t;
}
