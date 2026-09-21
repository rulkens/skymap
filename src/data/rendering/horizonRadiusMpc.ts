/**
 * HORIZON_RADIUS_MPC — the observable-universe horizon shell's radius in Mpc,
 * derived from `horizonShellRenderer`'s Gpc-space source of truth so the
 * fade band (`horizonShellPass`) and the Observable Universe view's fit
 * radius (`observableUniverse`) share one number instead of each re-deriving
 * `14.3 * 1000`.
 */

import { HORIZON_RADIUS_GPC } from '../../services/gpu/renderers/horizonShell/horizonShellRenderer';

/** Mpc → Gpc scale. */
const MPC_PER_GPC = 1000;

export const HORIZON_RADIUS_MPC = HORIZON_RADIUS_GPC * MPC_PER_GPC;
