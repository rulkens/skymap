/**
 * cursorRayBodyLocal — the pick ray through a CSS pixel, in body-fixed
 * metres (spec §6). Built from `basisLocal`'s columns and the view's frustum
 * tangents directly, the way the slab's projection maps NDC, so this ray can
 * never drift from the drawn view the way inverting a vp matrix could. An
 * off-axis frustum moves the pixel the forward column passes through.
 *
 * `pixel`/`viewportPx` are CSS pixels, origin top-left (y-down); NDC y is
 * flipped to match the camera's y-up `up` column.
 */

import type { BodyFixedPose } from '../../../@types/camera/pose/BodyFixedPose';
import type { BodyLocalRay } from '../../../@types/camera/terrain/BodyLocalRay';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { Vec2 } from '../../../@types/math/Vec2';
import { bodyFixedEyeM } from '../surfaceFrame/bodyFixedEyeM';

export function cursorRayBodyLocal(
  pose: BodyFixedPose,
  pixel: Readonly<Vec2>,
  viewportPx: Readonly<Vec2>,
  frustum: ViewFrustum,
): BodyLocalRay {
  const originM = bodyFixedEyeM(pose);
  const { basisLocal } = pose;

  const ndcX = (pixel[0] / viewportPx[0]) * 2 - 1;
  const ndcY = -((pixel[1] / viewportPx[1]) * 2 - 1);
  // Centre + half-extent, not a lerp between edges: on a symmetric frustum the
  // centre is exactly 0 and the half-extent exactly the edge, so the ray keeps
  // the pre-frustum `ndc · tan(fovY/2)` bits the settle golden trace pins.
  const { tanLeft, tanRight, tanDown, tanUp } = frustum;
  const rs = (tanRight + tanLeft) / 2 + ndcX * ((tanRight - tanLeft) / 2);
  const us = (tanUp + tanDown) / 2 + ndcY * ((tanUp - tanDown) / 2);

  // Columns: right = [0,1,2], up = [3,4,5], forward = [6,7,8] (BodyFixedPose doc).
  const dx = basisLocal[6] + basisLocal[0] * rs + basisLocal[3] * us;
  const dy = basisLocal[7] + basisLocal[1] * rs + basisLocal[4] * us;
  const dz = basisLocal[8] + basisLocal[2] * rs + basisLocal[5] * us;
  const len = Math.hypot(dx, dy, dz);

  return { originM, dir: [dx / len, dy / len, dz / len] };
}
