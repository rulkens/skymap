/** One step of the bounded orientation decay: `clamp(share·residual, ±capRad)`. */

import { ORIENT_DECAY } from '../../data/camera/orientDecay';

export function orientStepRad(residualRad: number): number {
  const share = ORIENT_DECAY.share * residualRad;
  return Math.sign(share) * Math.min(Math.abs(share), ORIENT_DECAY.capRad);
}
