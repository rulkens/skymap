/**
 * voyageReadouts — the overlay's readouts for `ship` on its trip to `destination`. Earth's clock is
 * Earth's own elapsed time, t(τ). "Ahead" is to the destination itself, standoff included; the
 * ship measures it shorter by γ, which is where the contracted scene draws it.
 */

import type { ShipState } from '../../@types/relativity/ShipState';
import type { VoyageDestination } from '../../layers/voyage/@types/VoyageDestination';
import type { VoyageReadouts } from '../../layers/voyage/@types/VoyageReadouts';
import { formatPowerOfTen } from '../format/formatPowerOfTen';
import { formatScalar } from '../format/formatScalar';
import { earthYrOfTau } from '../relativity/earthYrOfTau';
import { formatLightYears } from './formatLightYears';
import { formatSpeedOfLight } from './formatSpeedOfLight';
import { formatYears } from './formatYears';
import { voyageTripLy } from './voyageTripLy';

export function voyageReadouts(destination: VoyageDestination, ship: ShipState): VoyageReadouts {
  const tripLy = voyageTripLy(destination);
  const aheadLy = Math.max(0, tripLy + destination.standoffLy - ship.xLy);
  return {
    shipClock: formatYears(ship.tauYr),
    earthClock: formatYears(earthYrOfTau(tripLy, ship.tauYr)),
    speed: formatSpeedOfLight(ship.beta, ship.gamma),
    gamma: ship.gamma < 1000 ? formatScalar(ship.gamma) : formatPowerOfTen(ship.gamma, 3),
    aheadEarthLy: formatLightYears(aheadLy),
    aheadShipLy: formatLightYears(aheadLy / ship.gamma),
  };
}
