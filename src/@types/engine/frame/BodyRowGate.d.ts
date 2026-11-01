import type { ViewFrustum } from '../../camera/ViewFrustum';
import type { Vec3 } from '../../math/Vec3';

/** One view's eye, look direction and projection: what `visibleBodyRows` culls the
 *  frame's body-row candidates against. */
export type BodyRowGate = {
  readonly camPosMpc: Readonly<Vec3>;
  readonly camForwardMpc: Readonly<Vec3>;
  readonly frustum: ViewFrustum;
  readonly pxPerRad: number;
};
