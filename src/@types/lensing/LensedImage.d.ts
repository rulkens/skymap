/**
 * LensedImage — one image a gravitational lens makes of a point source.
 */

import type { Vec3 } from '../math/Vec3';

export type LensedImage = {
  /** Unit direction from the eye to this image. */
  readonly direction: Vec3;
  /** Flux ratio to the unlensed source; 1 = unlensed. Diverges at a caustic. */
  readonly magnification: number;
};
