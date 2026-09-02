/**
 * Sgr A*'s Schwarzschild radius in scene units (~0.085 AU). Lives in data, not
 * the engine: the body-slab path is barred from re-deriving Mpc<->metre
 * (tests/services/engine/camera/oneMpcSeam.test.ts).
 */

import { SCALE_UNITS } from '../scaleUnits';
import { schwarzschildRadiusM } from '../../utils/physics/schwarzschildRadiusM';
import { SGR_A_STAR_MASS_SOLAR } from './sgrAStarMassSolar';

export const SGR_A_STAR_SCHWARZSCHILD_RADIUS_MPC =
  schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR) * SCALE_UNITS.M_TO_MPC;
