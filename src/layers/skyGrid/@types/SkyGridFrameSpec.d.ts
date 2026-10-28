import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { SkyGridFrame } from '../../../@types/settings/SkyGridFrame';

/** One grid's frame → world (equatorial Cartesian) rotation, column-major, and its line colour. */
export type SkyGridFrameSpec = {
  readonly frame: SkyGridFrame;
  readonly toWorld: Mat3;
  readonly color: Vec3;
};
