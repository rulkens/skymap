import { MILKY_WAY_RADIUS_MPC } from './milkyWayRadiusMpc';
import { MILKY_WAY_GALAXY_PARAMS } from './milkyWayGalaxyParams';
import { outerRadiusOf } from '../../services/engine/galaxyGenerator/shared/outerRadiusOf';

/**
 * Local-galaxy-units -> Mpc. The generator works in the units `outerRadiusOf`
 * returns (roughly tens of "local" units); this scale is the one number that
 * reconciles those units with the app's Mpc-scaled scene, derived rather than
 * hand-picked so it always matches whatever `MILKY_WAY_GALAXY_PARAMS.radius`
 * currently is.
 */
export const MILKY_WAY_MODEL_SCALE = MILKY_WAY_RADIUS_MPC / outerRadiusOf(MILKY_WAY_GALAXY_PARAMS);
