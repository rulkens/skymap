/**
 * cursorRayBodyLocal — the pick ray through a CSS pixel, in body-fixed
 * metres (spec §6). Built from `basisLocal`'s columns and the FOV directly,
 * mirroring `fragment.wesl`'s `dir = normalize(forward + right·ndc.x·tanHalf·
 * aspect + up·ndc.y·tanHalf)` — so this ray can never drift from the slab's
 * view-projection the way re-deriving it from an inverted vp matrix could.
 *
 * `pixel`/`viewportPx` are CSS pixels, origin top-left (y-down); NDC y is
 * flipped to match the camera's y-up `up` column.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';

export function cursorRayBodyLocal(
  pose: BodyFixedPose,
  pixel: Readonly<Vec2>,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
): { readonly originM: Vec3; readonly dir: Vec3 } {
  const { anchorLocalM, eyeRelAnchorM, basisLocal } = pose;
  const originM: Vec3 = [
    anchorLocalM[0] + eyeRelAnchorM[0],
    anchorLocalM[1] + eyeRelAnchorM[1],
    anchorLocalM[2] + eyeRelAnchorM[2],
  ];

  const ndcX = (pixel[0] / viewportPx[0]) * 2 - 1;
  const ndcY = -((pixel[1] / viewportPx[1]) * 2 - 1);
  const aspect = viewportPx[0] / viewportPx[1];
  const tanHalf = Math.tan(fovYRad / 2);
  const rs = ndcX * tanHalf * aspect;
  const us = ndcY * tanHalf;

  // Columns: right = [0,1,2], up = [3,4,5], forward = [6,7,8] (BodyFixedPose doc).
  const dx = basisLocal[6] + basisLocal[0] * rs + basisLocal[3] * us;
  const dy = basisLocal[7] + basisLocal[1] * rs + basisLocal[4] * us;
  const dz = basisLocal[8] + basisLocal[2] * rs + basisLocal[5] * us;
  const len = Math.hypot(dx, dy, dz);

  return { originM, dir: [dx / len, dy / len, dz / len] };
}
