import type { Vec3 } from '../../math/Vec3';
import type { BodySurface } from '../../scene/BodySurface';

/** One opaque sphere a Layer draws on the NEAR0 row this frame. The surface, not a
 *  radius: NEAR0's range spans its outer bound, an occluder takes its inner bound. */
export type NearSphere = {
  readonly positionMpc: Readonly<Vec3>;
  readonly surface: BodySurface;
};
