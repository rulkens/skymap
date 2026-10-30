import type { FadeBand } from '../../@types/math/FadeBand';
import { FOREGROUND_RECEDE } from './foregroundRecede';

// `FOREGROUND_RECEDE` as a `FadeBand`, for the yields core does not resolve from an entry
// (a slab row's `activeBand`, a Layer's own fade), so they share its edges by import.
export const FOREGROUND_RECEDE_FADE_BAND: FadeBand = {
  fullAt: FOREGROUND_RECEDE.out[0],
  goneAt: FOREGROUND_RECEDE.out[1],
};
