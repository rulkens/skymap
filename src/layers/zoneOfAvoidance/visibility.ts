// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { MILKY_WAY_RADIUS_MPC } from '../../data/milkyWay/milkyWayRadiusMpc';

const R = MILKY_WAY_RADIUS_MPC;

// A window: the veil explains a cosmic-scale catalog gap, so it fades in as the Milky Way
// frames up (2R to 10R) and out once the Local Group is the subject. The out edges are
// literal Mpc: no `local-group` region exists to derive them from.
export const zoneOfAvoidanceVisibility = [
  { key: 'zoneOfAvoidance', bands: { veil: { in: [2 * R, 10 * R], out: [2, 6] } } },
  { label: 'zoneOfAvoidance', cluster: 'zoneOfAvoidance', of: 'zoneOfAvoidance' },
] as const satisfies readonly VisibilityEntry[];
