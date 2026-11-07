/**
 * rayThroughPx — the un-normalised world ray through a device pixel (y down)
 * of a pinhole view; `projectDirToPx`'s inverse.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { Size } from '../../../@types/rendering/Size';
import type { Vec3 } from '../../../@types/math/Vec3';

export function rayThroughPx(
  px: readonly [number, number],
  basis: ViewBasis,
  frustum: ViewFrustum,
  size: Size,
): Vec3 {
  const tx = frustum.tanLeft + (px[0] / size.width) * (frustum.tanRight - frustum.tanLeft);
  const ty = frustum.tanUp - (px[1] / size.height) * (frustum.tanUp - frustum.tanDown);
  const { forward: f, right: r, up: u } = basis;
  return [f[0] + r[0] * tx + u[0] * ty, f[1] + r[1] * tx + u[1] * ty, f[2] + r[2] * tx + u[2] * ty];
}
