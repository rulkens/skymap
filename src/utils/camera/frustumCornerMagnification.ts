/**
 * frustumCornerMagnification — how many times more pixels per radian a
 * pinhole frustum's farthest corner samples than its centre: `1 + tan²θ`
 * (= sec²θ, the radial stretch of a flat image plane) at the corner. A
 * screen-size bound fitted on the view axis holds anywhere in the view once
 * its pixels per radian are scaled by this.
 */

import type { ViewFrustum } from '../../@types/camera/ViewFrustum';

export function frustumCornerMagnification(frustum: ViewFrustum): number {
  const tanX = Math.max(-frustum.tanLeft, frustum.tanRight);
  const tanY = Math.max(-frustum.tanDown, frustum.tanUp);
  return 1 + tanX * tanX + tanY * tanY;
}
