/**
 * riddenOrientStepRad — ONE settle discipline (ruling 10): the correction a
 * driven zoom write applies against an orientation deviation. The deviation's
 * own per-notch movement (reference swing, target move — notch-authored)
 * rides in FULL up to `rideBoundRad`; beyond it is a blend degeneracy
 * flipping, treated as unauthored (round 6) — the excess joins the next
 * notch's deviation. The PRE-notch deviation decays by the capped share.
 * Both arms call THIS; an arm chooses only the frame the angles live in and
 * where the rotation pivots, so the rate policies cannot diverge.
 */

import { ORIENT_DECAY } from '../../data/camera/orientDecay';
import { orientStepRad } from './orientStepRad';

export function riddenOrientStepRad(deviationPreRad: number, deviationMoveRawRad: number): number {
  const move =
    Math.sign(deviationMoveRawRad) *
    Math.min(Math.abs(deviationMoveRawRad), ORIENT_DECAY.rideBoundRad);
  return move + orientStepRad(deviationPreRad);
}
