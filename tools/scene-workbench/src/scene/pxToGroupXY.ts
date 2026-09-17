/**
 * pxToGroupXY — a CSS pixel (origin top-left, +y down) to group-frame XY metres under a
 * nadir orthographic view built from the canvas's CSS size. That view's basis is horizontal,
 * so the map is affine and needs no matrix inverse.
 */
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { SceneCameraView } from '../render/sceneCameraView';

export function pxToGroupXY(view: SceneCameraView, px: Vec2): Vec2 {
  if (view.projection.kind !== 'orthographic')
    throw new Error('pxToGroupXY needs an orthographic view');
  const [width, height] = view.viewportPx;
  const h = view.projection.halfHeightM;
  const across = ((px[0] / width) * 2 - 1) * h * (width / height);
  const along = (1 - (px[1] / height) * 2) * h;
  const { targetM, rightM, upM } = view;
  return [
    targetM[0] + rightM[0] * across + upM[0] * along,
    targetM[1] + rightM[1] * across + upM[1] * along,
  ];
}
