/** voyageTripLy — the trip's length in light-years: launch at the Sun, rest `standoffLy` short of the target. */

import type { VoyageDestination } from '../../layers/voyage/@types/VoyageDestination';
import { SCALE_UNITS } from '../../data/scaleUnits';

export function voyageTripLy(destination: VoyageDestination): number {
  const [x, y, z] = destination.positionMpc;
  return Math.hypot(x, y, z) / SCALE_UNITS.LY_TO_MPC - destination.standoffLy;
}
