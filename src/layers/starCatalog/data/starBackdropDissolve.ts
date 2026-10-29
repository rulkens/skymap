import type { FadeBand } from '../../../@types/math/FadeBand';
import { backdropBand } from '../../../utils/math/backdropBand';
import { regionById } from '../../../utils/regions/regionById';

// Completes STRICTLY inside the entry's foreground band, which is what hides its edge. Pass-owned,
// not a visibility band: the dissolve acts at its ~23 kpc edge, long before the entry's foreground
// band, and a band there would drop seeded stars from scene-body admission while they still draw.
export const STAR_BACKDROP_DISSOLVE: FadeBand = backdropBand(
  regionById('solar-neighbourhood').extentMpc,
);
