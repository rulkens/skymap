/**
 * HORIZON_RADIUS_MPC — the horizon shell's radius in the Mpc the rest of the
 * scene is measured in, so the fade band (`horizonShellPass`) and the
 * Observable Universe view's fit radius share one number rather than each
 * re-deriving `14.3 * 1000`.
 */

import { HORIZON_RADIUS_GPC } from './horizonRadiusGpc';

/** Mpc → Gpc scale. */
const MPC_PER_GPC = 1000;

export const HORIZON_RADIUS_MPC = HORIZON_RADIUS_GPC * MPC_PER_GPC;
