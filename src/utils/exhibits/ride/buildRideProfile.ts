/**
 * buildRideProfile — the wall→sim table for riding a flyby. Sim speed ∝ max(sep, closestKm) / |vRel|,
 * so the craft crosses the frame at a roughly steady on-screen rate and the clock crawls at
 * closest pass. The floor on sep keeps the speed finite for a flyby that grazes the target's
 * centre. Wall time is the trapezoid integral of 1 / speed over the window, scaled to
 * `RIDE_WALL_MS`; the scale is the only free constant, so the pacing is set by the law alone.
 */

import type { MissionEvent } from '../../../@types/missions/MissionEvent';
import type { RideProfile } from '../../../@types/time/RideProfile';
import { RIDE_HALF_WINDOW_DAYS } from '../../../data/exhibits/ride/rideHalfWindowDays';
import { RIDE_SAMPLES } from '../../../data/exhibits/ride/rideSamples';
import { RIDE_WALL_MS } from '../../../data/exhibits/ride/rideWallMs';
import { unixMsToJulianDays } from '../../time/unixMsToJulianDays';
import { missionEventMs } from '../timeline/missionEventMs';
import { flybyRelativeState } from './flybyRelativeState';

const SECONDS_PER_DAY = 86_400;

export function buildRideProfile(event: MissionEvent, startWallMs: number): RideProfile | null {
  if (event.closestKm === undefined) return null;
  const tc = unixMsToJulianDays(missionEventMs(event));
  const t0 = tc - RIDE_HALF_WINDOW_DAYS;
  const stepDays = (2 * RIDE_HALF_WINDOW_DAYS) / (RIDE_SAMPLES - 1);

  const simDays = new Float64Array(RIDE_SAMPLES);
  const slowness = new Float64Array(RIDE_SAMPLES); // |vRel| / max(sep, closestKm), per second
  for (let i = 0; i < RIDE_SAMPLES; i++) {
    simDays[i] = t0 + i * stepDays;
    const state = flybyRelativeState(event, simDays[i]!);
    if (state === null) return null;
    slowness[i] = Math.hypot(...state.vKmS) / Math.max(Math.hypot(...state.rKm), event.closestKm);
  }

  const wallMs = new Float64Array(RIDE_SAMPLES);
  const stepS = stepDays * SECONDS_PER_DAY;
  for (let i = 1; i < RIDE_SAMPLES; i++) {
    wallMs[i] = wallMs[i - 1]! + 0.5 * stepS * (slowness[i - 1]! + slowness[i]!);
  }
  const scale = RIDE_WALL_MS / wallMs[RIDE_SAMPLES - 1]!;
  for (let i = 0; i < RIDE_SAMPLES; i++) wallMs[i] = wallMs[i]! * scale;
  // Pin the end so float scaling cannot leave the total off the contract by an ulp.
  wallMs[RIDE_SAMPLES - 1] = RIDE_WALL_MS;

  return { startWallMs, wallMs, simDays };
}
