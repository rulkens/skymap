// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SURVEY_DEEP_ZOOM } from '../../data/bands/surveyDeepZoom';

export const milkyWayVisibility = [
  {
    key: 'milkyWayDisk',
    cluster: 'milkyWay',
    recession: 'strong',
    // The impostor renders on NEAR0 and outlives the survey's deep-zoom band. The two
    // multiply: the Sun's descent hands off to the real Gaia stars (full >= 2 kpc, gone
    // <= 200 pc, deep enough that the procedural clumps do not vanish above the starfield
    // that replaces them), and the Centre's wider band stops the blowout there. It fades
    // fully to 0: a dim floor reads as over-bright star blobs this deep.
    bands: {
      approachSun: { in: [0.0002, 0.002] },
      approachCentre: { from: 'galactic-centre', in: [0.0006, 0.012] },
    },
  },
  {
    label: 'milkyWay',
    cluster: 'milkyWay',
    // Near edge: this annotation is COSMO-slab content anchored at the world origin, and
    // once the camera descends inside COSMO_NEAR_MPC (0.01 Mpc) the origin no longer
    // projects validly: the stem's endpoints land at a degenerate clip-w and blow up into
    // a screen-filling quad, and the non-empty line set keeps the 'marker-lines' pass
    // running every frame. The impostor could move to NEAR0; this label cannot, so it
    // rides the survey's shallower band (gone by 2 kpc, well clear of the blowup). Far
    // edge: full inside the Local Group (<0.6 Mpc), gone once large-scale structure fills
    // the view (>2 Mpc).
    bands: { youAreHere: { in: SURVEY_DEEP_ZOOM.in, out: [0.6, 2] } },
  },
] as const satisfies readonly VisibilityEntry[];
