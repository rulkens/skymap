/**
 * A director `project` for fixtures that draw through an identity vp: anchor
 * [x, y, 0] lands where that vp put it, ((x·0.5+0.5)·W, (0.5−y·0.5)·H), at view
 * depth 1, with the view's own `drawPxPerRad` as the focal length — so screen
 * positions, `clipW` and em sizes all match what those fixtures were written for.
 */

import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { Label2DProjection } from '../../../src/@types/rendering/Label2DProjection';

export function identityLabelProjection(ctx: FrameView): Label2DProjection {
  const { width, height } = ctx.canvasSize;
  const focalPx = ctx.drawPxPerRad;
  const viewFromSlab = new Float64Array(16);
  viewFromSlab[0] = width / 2 / focalPx;
  viewFromSlab[5] = height / 2 / focalPx;
  viewFromSlab[14] = 1;
  viewFromSlab[15] = 1;
  return {
    output: {
      kind: 'pinhole',
      viewFromWorld: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      camHi: [0, 0, 0],
      camLo: [0, 0, 0],
      up3: [0, 1, 0],
      sizePx: [width, height],
      centrePx: [width / 2, height / 2],
      focalPx,
      pxScale: 1,
    },
    viewFromSlab,
    nearClipMpc: 0,
  };
}
