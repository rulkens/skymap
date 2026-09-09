/**
 * ONE settle discipline (ruling 10), both arms: the deviation's notch-authored
 * move rides in full up to `rideBoundRad`; the pre-notch deviation decays by
 * the capped share. The bound is per-DOF policy — heading/roll pass
 * `ORIENT_DECAY.rideBoundRad` (a bigger move is a blend flip, unauthored: round
 * 6); tilt passes `Infinity` (ruling 12: bounding it would cross disengage with tilt).
 */

import { orientStepRad } from './orientStepRad';

export function riddenOrientStepRad(
  deviationPreRad: number,
  deviationMoveRawRad: number,
  rideBoundRad: number,
): number {
  const move =
    Math.sign(deviationMoveRawRad) * Math.min(Math.abs(deviationMoveRawRad), rideBoundRad);
  return move + orientStepRad(deviationPreRad);
}
