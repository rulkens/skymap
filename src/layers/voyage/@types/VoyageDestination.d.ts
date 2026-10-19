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
  /** The famous-galaxy id the arrival framing focuses; null where there is none. */
  readonly focusId: 'm31' | 'm87' | null;
  readonly standoffLy: number;
};
