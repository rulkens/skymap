import type { FadeBand } from '../../../@types/math/FadeBand';
import { backdropBand } from '../../../utils/math/backdropBand';
import { regionById } from '../../../utils/regions/regionById';

// Completes STRICTLY inside the hard foreground gate, which is what hides its cut. Pass-owned,
// not a visibility band: a band on the entry would drop seeded stars from scene-body admission.
export const STAR_BACKDROP_DISSOLVE: FadeBand = backdropBand(
  regionById('solar-neighbourhood').extentMpc,
);
