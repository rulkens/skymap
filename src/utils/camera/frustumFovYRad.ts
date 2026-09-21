/**
 * frustumFovYRad — a frustum's vertical field of view in radians, off its
 * tangent extents. For a symmetric frustum this is `2·atan(tanUp)`, ulp-equal
 * to the `(viewportHeightPx, fovYRad)` round-trip `turnedOrbitCamera` produces.
 */

import type { ViewFrustum } from '../../@types/camera/ViewFrustum';

export function frustumFovYRad(frustum: ViewFrustum): number {
  return Math.atan(frustum.tanUp) - Math.atan(frustum.tanDown);
}
