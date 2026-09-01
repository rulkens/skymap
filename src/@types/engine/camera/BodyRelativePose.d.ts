/**
 * BodyRelativePose — the camera, re-expressed in one body's own fixed frame
 * (its centre at the origin, its local axes as the basis), in SI metres.
 *
 * The seam every body-local render pass (Task 2 onward) reads instead of the
 * Mpc/heliocentric camera the rest of the engine works in — see
 * `bodyRelativePose` for the derivation.
 */

import type { Vec3 } from '../../math/Vec3';
import type { Mat3 } from '../../math/Mat3';

export type BodyRelativePose = {
  /** Eye − body centre, expressed in the body's FIXED axes, in metres, f64. */
  readonly eyeRelBodyM: Vec3;
  /** Camera right | up | forward as columns, in the body's fixed axes. */
  readonly basisM: Mat3;
};
