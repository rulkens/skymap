// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { BLACK_HOLE_SOURCE_ROWS } from './sources/blackHoleSourceRows';
import { GALACTIC_CENTRE_ANCHOR } from '../../data/places/galacticCentre';
import { MILKY_WAY_RADIUS_MPC } from '../../data/milkyWay/milkyWayRadiusMpc';

// Full from home all the way in (R₀), gone a disc diameter out, where the galaxy is one object
// among many. Not off `galactic-centre`'s extent: that measures the S-star orbits, and would put
// the name's onset inside the cluster it labels.
const CAPTION_FULL_MPC = Math.hypot(...GALACTIC_CENTRE_ANCHOR.positionMpc);

export const blackHolesVisibility = [
  {
    label: 'blackHole',
    cluster: 'blackHoles',
    items: BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => entry.id),
    recession: 'mild',
    bands: {
      caption: { from: 'galactic-centre', out: [CAPTION_FULL_MPC, MILKY_WAY_RADIUS_MPC * 2] },
    },
  },
] as const satisfies readonly VisibilityEntry[];
