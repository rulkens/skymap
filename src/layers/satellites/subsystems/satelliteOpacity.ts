/**
 * satelliteOpacity — how much of the satellite Layer shows, before the show toggle's own fade:
 * 1 near Earth and near the data's fetch time, easing to 0 with distance from Earth and with sim
 * time away from the fetch (spec §5.3: elements a fortnight old are hundreds of km off).
 */
import { DAY_MS } from '../../../data/time/dayMs';
import { SATELLITE_FADES as F } from '../../../data/satellites/satelliteFades';

const ease = (x: number): number => x * x * (3 - 2 * x);
const falloff = (v: number, full: number, gone: number): number =>
  v <= full ? 1 : v >= gone ? 0 : ease((gone - v) / (gone - full));

export function satelliteOpacity(
  simMs: number,
  fetchedAtMs: number,
  cameraEarthKm: number,
): number {
  const epochDays = Math.abs(simMs - fetchedAtMs) / DAY_MS;
  return (
    falloff(cameraEarthKm, F.fullWithinKm, F.goneBeyondKm) *
    falloff(epochDays, F.epochFullDays, F.epochGoneDays)
  );
}
