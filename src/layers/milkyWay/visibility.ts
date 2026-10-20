// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SURVEY_DEEP_ZOOM } from '../../data/bands/surveyDeepZoom';

export const milkyWayVisibility = [
  {
    key: 'milkyWayDisk',
    cluster: 'milkyWay',
    recession: 'strong',
    // The two multiply: the Sun's descent hands off to the real Gaia stars, and the Centre's
    // wider band stops the blowout there. Fully to 0: a dim floor reads as over-bright blobs.
    bands: {
      approachSun: { in: [0.0002, 0.002] },
      approachCentre: { from: 'galactic-centre', in: [0.0006, 0.012] },
    },
  },
  {
    label: 'milkyWay',
    cluster: 'milkyWay',
    // Near edge: COSMO-slab content at the world origin; inside COSMO_NEAR_MPC (0.01 Mpc)
    // its stem's clip-w degenerates into a screen-filling quad, so it rides the survey's
    // shallower band. Far edge: gone once large-scale structure fills the view.
    bands: { youAreHere: { in: SURVEY_DEEP_ZOOM.in, out: [0.6, 2] } },
  },
] as const satisfies readonly VisibilityEntry[];
