// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { HORIZON_RADIUS_MPC } from './data/horizonRadiusMpc';

// The shell fades in with pull-back. Below 5 % of its radius (~0.7 Gpc) it is chrome
// wrapped impossibly far round the galaxies being studied; by 40 % (~5.7 Gpc) the whole
// quasar shell is in frame, the context it is drawn for. Fractions of the radius, so a
// different horizon distance keeps the same pacing.
export const cosmicHorizonVisibility = [
  {
    key: 'cosmicHorizon',
    bands: { reach: { in: [0.05 * HORIZON_RADIUS_MPC, 0.4 * HORIZON_RADIUS_MPC] } },
  },
] as const satisfies readonly VisibilityEntry[];
