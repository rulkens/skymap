// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { NEIGHBOURHOOD_RECEDE_KPC } from '../../data/bands/neighbourhoodRecedeKpc';
import { MILKY_WAY_RADIUS_MPC } from '../../data/milkyWay/milkyWayRadiusMpc';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../data/rendering/foregroundMaxDistance';
import { SCALE_UNITS } from '../../data/scaleUnits';

const KPC = SCALE_UNITS.KPC_TO_MPC;

// Halo-scale: they arrive as the Sun's neighbourhood recedes and leave with the foreground gate,
// where core skips NEAR0 passes.
export const stellarStreamsVisibility = [
  {
    key: 'stellarStreams',
    selects: ['stellarStream'],
    recession: 'strong',
    bands: {
      streams: {
        in: [4 * KPC, NEIGHBOURHOOD_RECEDE_KPC * KPC],
        out: [MILKY_WAY_RADIUS_MPC * 2, FOREGROUND_MAX_DISTANCE_MPC],
      },
    },
  },
  { label: 'stellarStream', cluster: 'stellarStreams', of: 'stellarStreams', recession: 'mild' },
] as const satisfies readonly VisibilityEntry[];
