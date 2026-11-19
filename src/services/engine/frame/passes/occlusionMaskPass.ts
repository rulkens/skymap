/**
 * occlusionMaskPass — the occlusion mask of one view: what its foreground puts in front
 * of an overlay, per pixel. Its step must declare `depth: { sample: 'foreground:0' }`.
 * Always on, so its step opens and the target's first-touch clear lands: a view that
 * drew no foreground then holds "nothing in front", never last frame's mask. The draw
 * itself waits for THIS view's `foreground:0`: `renderedTargets` is frame-wide, so on a
 * rig of several views it also says yes to another view's image left in that target.
 * The sampled row is this view's own fact (`sampledDepthFor`).
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';

export const occlusionMaskPass: ContentPass = {
  name: 'occlusion-mask',

  enabled(state) {
    return state.gpu.occlusionMaskRenderer !== null;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.occlusionMaskRenderer;
    if (renderer === null || view.sampledDepth === undefined || view.sampledDepth.row === null) {
      return;
    }
    const scene = overlaySceneOcclusion(ctx, view);
    if (scene === undefined) return;
    renderer.draw(pass, scene, [ctx.canvasSize.width, ctx.canvasSize.height]);
  },
};
