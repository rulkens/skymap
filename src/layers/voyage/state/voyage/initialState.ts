/** Voyage default — no trip (the rest frame); the effects on, headlight k = 1, the clock at 1×. */

import type { VoyageSettings } from '../../@types/VoyageSettings';

export const initialState: VoyageSettings = {
  destination: null,
  launchDays: null,
  contraction: true,
  doppler: true,
  headlight: 1,
  speed: 1,
};
