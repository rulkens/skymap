/**
 * ExtraGalaxySpec — full specification for an additional generated galaxy
 * instance: generation parameters, world position, scale factor, and
 * orientation angles for Y-axis rotation and X-axis tilt.
 */

import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GalaxyParams } from '../model/GalaxyParams';

export type ExtraGalaxySpec = {
  readonly params: GalaxyParams;
  readonly pos: Vec3;
  readonly scale: number;
  readonly rotY: number;
  readonly tiltX: number;
};
