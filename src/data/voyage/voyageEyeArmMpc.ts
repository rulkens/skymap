/**
 * VOYAGE_EYE_ARM_MPC — the orbit distance the voyage camera keeps its target ahead of the ship,
 * so the eye sits on the ship. 100 au: the near plane is 1e-4 of it (0.01 au, under every planet
 * at launch), and the eye − target subtraction at M87's 17 Mpc still resolves the view to ~1e-5 rad.
 */

import { SCALE_UNITS } from '../scaleUnits';

export const VOYAGE_EYE_ARM_MPC = 100 * SCALE_UNITS.AU_TO_MPC;
