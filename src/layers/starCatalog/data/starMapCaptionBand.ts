import type { FadeBand } from '../../../@types/math/FadeBand';
import { regionById } from '../../../utils/regions/regionById';

const EXTENT_MPC = regionById('solar-neighbourhood').extentMpc;

// Keyed on each star's own distance from the eye, so it rides a caption's `revealBand`, not an
// entry band. Full just past the farthest seed (the whole map reads from home), gone at twice it.
export const STAR_MAP_CAPTION_BAND: FadeBand = { fullAt: EXTENT_MPC * 1.1, goneAt: EXTENT_MPC * 2 };
