/**
 * Sightlines on the galactic plane for the Zone of Avoidance clips, in world
 * (equatorial) coordinates: along the plane toward the Galactic Centre, where
 * the band is widest, and down onto it from the north galactic side.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import { normalize3 } from '../../../../utils/math/normalize3';
import { GAL_X_EQ, GAL_Z_EQ } from '../../../orientation/orientationFrames';

const TILT_RAD = (50 * Math.PI) / 180;

export const GALACTIC_EDGE_ON: Vec3 = GAL_X_EQ;

export const GALACTIC_FROM_ABOVE: Vec3 = normalize3([
  Math.cos(TILT_RAD) * GAL_X_EQ[0] - Math.sin(TILT_RAD) * GAL_Z_EQ[0],
  Math.cos(TILT_RAD) * GAL_X_EQ[1] - Math.sin(TILT_RAD) * GAL_Z_EQ[1],
  Math.cos(TILT_RAD) * GAL_X_EQ[2] - Math.sin(TILT_RAD) * GAL_Z_EQ[2],
]);
