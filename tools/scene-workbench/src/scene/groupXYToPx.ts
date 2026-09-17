/**
 * groupXYToPx — the inverse of `pxToGroupXY`: group-frame XY metres to a CSS pixel
 * (origin top-left, +y down) under a nadir orthographic view built from the canvas's CSS size.
 */
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { SceneCameraView } from '../render/sceneCameraView';

export function groupXYToPx(view: SceneCameraView, xyM: Vec2): Vec2 {
  if (view.projection.kind !== 'orthographic')
    throw new Error('groupXYToPx needs an orthographic view');
  const [width, height] = view.viewportPx;
  const h = view.projection.halfHeightM;
  const { targetM, rightM, upM } = view;
  const dx = xyM[0] - targetM[0];
  const dy = xyM[1] - targetM[1];
  // rightM and upM are orthonormal and horizontal, so a dot product is the coordinate.
  const across = (dx * rightM[0] + dy * rightM[1]) / (h * (width / height));
  const along = (dx * upM[0] + dy * upM[1]) / h;
  return [((across + 1) / 2) * width, ((1 - along) / 2) * height];
}
