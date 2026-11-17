import type { Vec3 } from '../math/Vec3';

/** An opaque body as `sceneOccluderBodies` hands it out: the inner-bound sphere
 *  that occludes, plus the outer bound, so `radiusM..outerRadiusM` is the band its ground spans. */
export type OccluderBody = {
  readonly positionMpc: Readonly<Vec3>;
  readonly radiusM: number;
  readonly outerRadiusM: number;
};
