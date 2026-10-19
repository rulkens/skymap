/**
 * VoyageDestination — one trip's target. The ship launches from the Sun and comes to rest
 * `standoffLy` short of `positionMpc` along the line of flight, so the trip is
 * `|positionMpc| − standoffLy` long (`voyageTripLy`).
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { VoyageDestinationId } from './VoyageDestinationId';

export type VoyageDestination = {
  readonly id: VoyageDestinationId;
  readonly label: string;
  /** World Mpc, equatorial J2000, from the same catalogue numbers the scene draws it at. */
  readonly positionMpc: Readonly<Vec3>;
  /** The sphere the arrival view fits about a destination galaxy; null keeps the view on the ship. */
  readonly arrivalRadiusMpc: number | null;
  readonly standoffLy: number;
};
