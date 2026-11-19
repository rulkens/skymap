/**
 * occlusionMaskPass — the occlusion mask of one view: what its foreground puts in front
 * of an overlay, per pixel. Off until `foreground:0` has been drawn this frame, the gate
 * `overlaySceneOcclusion` gives every reader of that joint. Its step must declare
 * `depth: { sample: 'foreground:0' }`, or the distance channel reads "no surface".
 * Not in `CONTENT_PASSES` yet: `checkFrameOrder` refuses a pass no program line draws,
 * so it registers with the first step that lists it.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';

export const occlusionMaskPass: ContentPass = {
  name: 'occlusion-mask',

  enabled(state, ctx, view) {
    return (
      state.gpu.occlusionMaskRenderer !== null && overlaySceneOcclusion(ctx, view) !== undefined
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.occlusionMaskRenderer;
    const scene = overlaySceneOcclusion(ctx, view);
    if (renderer === null || scene === undefined) return;
    renderer.draw(pass, scene, [ctx.canvasSize.width, ctx.canvasSize.height]);
  },
};
