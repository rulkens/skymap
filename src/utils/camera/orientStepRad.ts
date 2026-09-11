/** One step of the bounded orientation decay, priced in spent log-zoom (`ORIENT_DECAY`). */

import { ORIENT_DECAY } from '../../data/camera/orientDecay';

export function orientStepRad(residualRad: number, logZoom: number): number {
  const u = Math.abs(logZoom);
  const spent = residualRad * (1 - Math.exp(-ORIENT_DECAY.perLogZoom * u));
  return Math.sign(spent) * Math.min(Math.abs(spent), ORIENT_DECAY.capRadPerLogZoom * u);
}
