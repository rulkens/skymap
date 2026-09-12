import type { BodyId } from '../data/body/BodyId';
import type { Mat3 } from '../math/Mat3';
import type { Vec3 } from '../math/Vec3';

/**
 * The camera in one body's FIXED axes, SI metres, f64 — anchor-relative so the
 * stored magnitudes shrink with zoom instead of sitting at body-radius scale.
 */
export type BodyFixedPose = {
  readonly bodyId: BodyId;
  /** Body-fixed anchor point, metres. `[0,0,0]` = body centre (ruled, S2). */
  readonly anchorLocalM: Vec3;
  /** Eye − anchor, body-fixed axes, metres. */
  readonly eyeRelAnchorM: Vec3;
  /** right | up | forward as columns, body-fixed axes, orthonormal. */
  readonly basisLocal: Mat3;
};
