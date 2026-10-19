/**
 * buildVoyageProfile — the wall→sim table that plays a voyage from `fromDays` to arrival with
 * wall time proportional to ship time: the whole trip takes `VOYAGE_WALL_MS / speed`. Samples are
 * equal steps of τ about `STEP_MS` of wall apart, each at launch + t(τ). Earth time grows like
 * sinh(aτ), so the table must be dense in τ: linear between samples, a coarse one would play
 * Earth days evenly and the ship clock in jumps.
 */

import type { ClockProfile } from '../../@types/time/ClockProfile';
import type { VoyageDestination } from '../../layers/voyage/@types/VoyageDestination';
import { JULIAN_YEAR_DAYS } from '../../data/time/julianYearDays';
import { VOYAGE_WALL_MS } from '../../data/voyage/voyageWallMs';
import { earthYrOfTau } from '../relativity/earthYrOfTau';
import { shipStateAt } from '../relativity/shipStateAt';
import { tripOf } from '../relativity/tripOf';
import { voyageTripLy } from './voyageTripLy';

const STEP_MS = 50;

export function buildVoyageProfile(
  destination: VoyageDestination,
  fromDays: number,
  launchDays: number,
  /** A `MISSION_SPEEDS` factor. */
  speed: number,
  nowMs: number,
): ClockProfile {
  const tripLy = voyageTripLy(destination);
  const { tauTotalYr } = tripOf(tripLy);
  const tauFromYr = shipStateAt(tripLy, (fromDays - launchDays) / JULIAN_YEAR_DAYS).tauYr;
  const spanYr = tauTotalYr - tauFromYr;
  const totalMs = (spanYr / tauTotalYr) * (VOYAGE_WALL_MS / speed);
  const steps = Math.ceil(totalMs / STEP_MS);
  const wallMs = new Float64Array(steps + 1);
  const simDays = new Float64Array(steps + 1);
  // The first sample is the instant asked for, not its τ round trip, so the clock never jumps.
  simDays[0] = fromDays;
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    wallMs[i] = f * totalMs;
    simDays[i] = launchDays + earthYrOfTau(tripLy, tauFromYr + f * spanYr) * JULIAN_YEAR_DAYS;
  }
  return { startWallMs: nowMs, wallMs, simDays };
}
