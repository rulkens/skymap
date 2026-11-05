/**
 * frustumFovYRad — the vertical lens angle behind a frustum, off its tangent
 * extent. Taken from `tanUp − tanDown`, not the edge angles, so a lens-shifted
 * window reads the same lens as the centred one (pick tolerances stay equal
 * to the gestures' `projection.fovYRad`); for a symmetric frustum both agree.
 */

import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';

export function frustumFovYRad(frustum: ViewFrustum): number {
  return 2 * Math.atan((frustum.tanUp - frustum.tanDown) / 2);
}
