/**
 * starAggregatesPass — the survey star AGGREGATE stream, drawn LINEAR into the
 * half-res `star-aggregates` offscreen. Interior flux-mip glows fill their box
 * footprint, so at kpc zoom they deposit many screens of additive overdraw; the
 * half-res target quarters that. `star-upsample` composites it back with the
 * knee on the SUMMED field; the leaf stream stays full-res (`starCatalogPass`).
 * `enabled` shares `starCatalogVisible` with that upsample: the offscreen is
 * cleared on first touch, so a skipped draw beside a running upsample would
 * composite last frame's aggregates.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { starCatalogVisible } from '../render/cut/starCatalogVisible';
import { drawStarCut } from '../render/cut/drawStarCut';

export function starAggregatesPass(runtime: StarCatalogRuntime): ContentPass {
  return {
    name: 'star-aggregates',

    enabled(state, ctx, _view) {
      return starCatalogVisible(runtime, state.settings.starCatalogs, ctx);
    },

    draw(pass, view, ctx, state) {
      // The DESTINATION target's size, not the canvas: STAR_GLOW_MIN_PX floors the
      // radius in pixels OF THE TARGET RASTERISED, so the canvas size would put the
      // floor sub-texel here (dropout and flicker). A capture face's synthetic ctx
      // already carries its own size. The view is COPIED: one `SlabView` is shared
      // by every pass in the render step.
      const { width: vw, height: vh } =
        ctx.viewKind === 'capture'
          ? ctx.canvasSize
          : ctx.snapshot.renderTargets.sizeOf('star-aggregates');

      drawStarCut(runtime.renderer, pass, { ...view, viewportPx: [vw, vh] }, ctx, 'aggregate');
    },
  };
}
