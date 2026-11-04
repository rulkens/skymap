/**
 * frustumRayAxis — the unnormalised world ray through the frustum window's
 * centre. A shell shader adds `ndc · tanHalf` along right/up to it, so an
 * off-axis frustum's rays need no extra uniform. Symmetric ⇒ `forward` exactly.
 */

import type { ViewFrustum } from '../../../@types/camera/ViewFrustum';
import type { Vec3 } from '../../../@types/math/Vec3';

export function frustumRayAxis(
  forward: Readonly<Vec3>,
  right: Readonly<Vec3>,
  up: Readonly<Vec3>,
  frustum: ViewFrustum,
  out: Vec3,
): Vec3 {
  const cx = (frustum.tanLeft + frustum.tanRight) / 2;
  const cy = (frustum.tanDown + frustum.tanUp) / 2;
  out[0] = forward[0] + right[0] * cx + up[0] * cy;
  out[1] = forward[1] + right[1] * cx + up[1] * cy;
  out[2] = forward[2] + right[2] * cx + up[2] * cy;
  return out;
}
