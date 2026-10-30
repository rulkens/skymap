/**
 * satelliteOpacity — the data-age fade of the satellite Layer: 1 near the data's fetch time,
 * easing to 0 with sim time away from it (spec §5.3: elements a fortnight old are hundreds of km
 * off). The camera's distance from Earth is the visibility entry's `nearEarth` band.
 */
import { DAY_MS } from '../../../data/time/dayMs';
import { SATELLITE_FADES as F } from '../../../data/satellites/satelliteFades';
import { smoothstep } from '../../../utils/math/smoothstep';

export function satelliteOpacity(simMs: number, fetchedAtMs: number): number {
  const epochDays = Math.abs(simMs - fetchedAtMs) / DAY_MS;
  return 1 - smoothstep(F.epochFullDays, F.epochGoneDays, epochDays);
}
