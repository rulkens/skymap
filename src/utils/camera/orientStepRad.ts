/**
 * One step of the bounded orientation decay, priced in the notch's log-zoom
 * `u = |ln factor|` (`ORIENT_DECAY`): the multiplier `e^(−k·u)` composes, so N
 * notches spend exactly what their product spends — and a twitch spends ~1 %.
 */

import { ORIENT_DECAY } from '../../data/camera/orientDecay';

export function orientStepRad(residualRad: number, logZoom: number): number {
  const u = Math.abs(logZoom);
  const spent = residualRad * (1 - Math.exp(-ORIENT_DECAY.perLogZoom * u));
  return Math.sign(spent) * Math.min(Math.abs(spent), ORIENT_DECAY.capRadPerLogZoom * u);
}
