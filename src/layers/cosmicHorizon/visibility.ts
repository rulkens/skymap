// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { HORIZON_RADIUS_MPC } from './data/horizonRadiusMpc';

// Below 5 % of the radius the shell is chrome wrapped round the galaxies being studied;
// by 40 % the whole quasar shell is in frame. Fractions, so pacing survives a new radius.
export const cosmicHorizonVisibility = [
  {
    key: 'cosmicHorizon',
    bands: { reach: { in: [0.05 * HORIZON_RADIUS_MPC, 0.4 * HORIZON_RADIUS_MPC] } },
  },
] as const satisfies readonly VisibilityEntry[];
