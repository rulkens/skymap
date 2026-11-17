/**
 * satelliteOpacity — the data-age fade of the satellite Layer: 1 from shortly before the data's
 * fetch time onwards, easing to 0 further into the past (`SATELLITE_FADES` says why only the
 * past). The camera's distance from Earth is the visibility entry's `nearEarth` band.
 */
import { DAY_MS } from '../../../../data/time/dayMs';
import { SATELLITE_FADES as F } from '../data/satelliteFades';
import { smoothstep } from '../../../../utils/math/smoothstep';

export function satelliteOpacity(simMs: number, fetchedAtMs: number): number {
  const daysBefore = (fetchedAtMs - simMs) / DAY_MS;
  return 1 - smoothstep(F.pastFullDays, F.pastGoneDays, daysBefore);
}
