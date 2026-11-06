/**
 * dwellLeadIn — the enter clip's half of a flowing beat: spins yaw up to the
 * dwell's `cruiseRate` over `sec`, on the velocity layer, so it may overlap the
 * clip's own aim move. Place it to end on the landing; the dwell, built with
 * `dwellDrift(…, { flowIn: true })`, starts at the same rate.
 */

import type { Effect } from '../../@types/animation/Effect';
import { rate } from '../../services/engine/animation/effectHelpers';

export function dwellLeadIn(cruiseRate: number, sec: number): Effect {
  return rate('yaw', { to: cruiseRate, over: sec, ease: 'easeInOutSine' });
}
