/**
 * ONE settle discipline (ruling 10), both arms: the deviation's notch-authored
 * move rides in full up to `rideBoundRad`; the pre-notch deviation decays by
 * the capped share of `logZoom` — only the DECAY half is priced in zoom, the
 * ride being notch-authored already. The bound is per-DOF policy: heading/roll
 * pass `ORIENT_DECAY.rideBoundRad` (a bigger move is an unauthored blend
 * flip); tilt passes `Infinity`, or it would cross disengage with tilt (12).
 */

import { orientStepRad } from './orientStepRad';

export function riddenOrientStepRad(
  deviationPreRad: number,
  deviationMoveRawRad: number,
  rideBoundRad: number,
  logZoom: number,
): number {
  const move =
    Math.sign(deviationMoveRawRad) * Math.min(Math.abs(deviationMoveRawRad), rideBoundRad);
  return move + orientStepRad(deviationPreRad, logZoom);
}
