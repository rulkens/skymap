/**
 * VoyageSettings — the voyage Layer's Intent: which trip, when it launched (sim Julian days, Earth
 * time), the three effect toggles and the transport speed. `destination: null` is the rest frame,
 * so a takeover bracket that restores the cluster also removes the boost.
 */

import type { VoyageDestinationId } from './VoyageDestinationId';

export type VoyageSettings = {
  readonly destination: VoyageDestinationId | null;
  readonly launchDays: number | null;
  readonly contraction: boolean;
  readonly doppler: boolean;
  /** The headlight exponent k ∈ [0, 4]; 0 is off. */
  readonly headlight: number;
  /** A `MISSION_SPEEDS` factor, as the missions transport. */
  readonly speed: number;
};
