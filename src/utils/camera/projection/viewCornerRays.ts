/**
 * viewCornerRays — the four corner rays of a view in world axes. Directions
 * only: no position enters, so no Mpc-scale value is ever narrowed.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { ViewCornerRays } from '../../../@types/camera/projection/ViewCornerRays';
import type { Vec3 } from '../../../@types/math/Vec3';

export function viewCornerRays(basis: ViewBasis, frustum: ViewFrustum): ViewCornerRays {
  const { forward: f, right, up } = basis;
  const ray = (tx: number, ty: number): Vec3 => [
    f[0] + right[0] * tx + up[0] * ty,
    f[1] + right[1] * tx + up[1] * ty,
    f[2] + right[2] * tx + up[2] * ty,
  ];
  return {
    tl: ray(frustum.tanLeft, frustum.tanUp),
    tr: ray(frustum.tanRight, frustum.tanUp),
    bl: ray(frustum.tanLeft, frustum.tanDown),
    br: ray(frustum.tanRight, frustum.tanDown),
  };
}
