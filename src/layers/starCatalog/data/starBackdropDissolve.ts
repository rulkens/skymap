import type { FadeBand } from '../../../@types/math/FadeBand';
import { backdropBand } from '../../../utils/math/backdropBand';
import { regionById } from '../../../utils/regions/regionById';

// Keyed on the camera's distance from the `solar-neighbourhood` anchor, Mpc. Dissolves the
// minimum-size additive point backdrop before the hard FOREGROUND_MAX_DISTANCE_MPC gate
// would pop it off; the band completing STRICTLY inside the gate is what hides the cut.
// Pass-owned, not a visibility band: a band on the entry would drop seeded stars from
// scene-body admission.
export const STAR_BACKDROP_DISSOLVE: FadeBand = backdropBand(
  regionById('solar-neighbourhood').extentMpc,
);
