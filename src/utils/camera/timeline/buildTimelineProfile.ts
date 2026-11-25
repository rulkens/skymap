/**
 * buildTimelineProfile — the wall→sim table that plays a craft's timeline from `fromDays` to
 * `endDays`. Each leg (stop to stop, the last to the end) takes `TIMELINE_LEG_WALL_MS` at 1×;
 * near a planet the sim speed is capped at `FRAME_CROSSINGS_PER_S` × frame diameter / the
 * craft's speed relative to it, so the frame never shrinks faster than the eye can follow, and
 * the speed grows at most e-fold per `TIMELINE_RAMP_MS`, so it never leaps leaving a cap.
 * Integrated in fixed wall steps, each landing exactly on a leg boundary it reaches.
 */

import type { TimelineStop } from '../../../@types/camera/timeline/TimelineStop';
import type { ClockProfile } from '../../../@types/time/ClockProfile';
import { FRAME_CROSSINGS_PER_S } from '../../../data/camera/timeline/frameCrossingsPerS';
import { TIMELINE_LEG_WALL_MS } from '../../../data/camera/timeline/timelineLegWallMs';
import { TIMELINE_RAMP_MS } from '../../../data/camera/timeline/timelineRampMs';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { unixMsToJulianDays } from '../../time/unixMsToJulianDays';
import { bodyPositionMpcAt } from '../../exhibits/mission/bodyPositionMpcAt';
import { bodyRelativeState } from './bodyRelativeState';
import { timelineFrame } from './timelineFrame';
import { SECONDS_PER_DAY } from '../../../data/time/secondsPerDay';

const STEP_MS = 50;
const RAMP = Math.exp(STEP_MS / TIMELINE_RAMP_MS);

/** Sim seconds per wall second the near-planet cap allows at `simDays`; Infinity in cruise. */
function capAt(stops: readonly TimelineStop[], craftId: string, simDays: number): number {
  const frame = timelineFrame(stops, craftId, simDays, (id) => bodyPositionMpcAt(id, simDays));
  if (frame === null) return Infinity;
  if (!frame.stop?.planetId) return Infinity;
  const rel = bodyRelativeState(craftId, frame.stop.planetId, simDays);
  if (rel === null) return Infinity;
  const diameterKm = (2 * frame.radiusMpc) / SCALE_UNITS.KM_TO_MPC;
  return (FRAME_CROSSINGS_PER_S * diameterKm) / Math.hypot(...rel.vKmS);
}

export function buildTimelineProfile(
  stops: readonly TimelineStop[],
  craftId: string,
  fromDays: number,
  endDays: number,
  /** A `TIMELINE_SPEEDS` factor. */
  factor: number,
  startWallMs: number,
): ClockProfile {
  const bounds = [...stops.map((s) => unixMsToJulianDays(s.ms)), endDays];
  let t = Math.max(fromDays, bounds[0]!);
  let wall = 0;
  const wallMs = [wall];
  const simDays = [t];
  let leg = 0;
  let lastRate = Infinity;
  while (t < endDays) {
    while (leg + 2 < bounds.length && bounds[leg + 1]! <= t) leg++;
    const legEnd = Math.min(bounds[leg + 1]!, endDays);
    const legRate =
      ((bounds[leg + 1]! - bounds[leg]!) * SECONDS_PER_DAY) / (TIMELINE_LEG_WALL_MS / 1000);
    const rate = Math.min(factor * Math.min(legRate, capAt(stops, craftId, t)), lastRate * RAMP);
    lastRate = rate;
    const stepDays = (rate * STEP_MS) / 1000 / SECONDS_PER_DAY;
    if (t + stepDays >= legEnd) {
      wall += (((legEnd - t) * SECONDS_PER_DAY) / rate) * 1000;
      t = legEnd;
    } else {
      wall += STEP_MS;
      t += stepDays;
    }
    wallMs.push(wall);
    simDays.push(t);
  }
  return {
    startWallMs,
    wallMs: Float64Array.from(wallMs),
    simDays: Float64Array.from(simDays),
  };
}
