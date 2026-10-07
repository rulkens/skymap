/**
 * Draws the octree cut's LEAF stream (real stars) into HDR at full
 * resolution; the AGGREGATE stream (flux-mip glows) draws separately at
 * half-res via `starAggregatesPass`, sharing `drawStarCut` /
 * `starCatalogVisible` so the two agree. Pick is leaf-only — an aggregate
 * stands for a subtree, no single star to name.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { starCatalogVisible } from '../render/cut/starCatalogVisible';
import { drawStarCut } from '../render/cut/drawStarCut';
import { drawStarPick } from '../render/cut/drawStarPick';

export function starCatalogPass(runtime: StarCatalogRuntime): ContentPass {
  return {
    name: 'star-catalog',

    enabled(state, ctx, _view) {
      return starCatalogVisible(runtime, state.settings.starCatalogs, ctx);
    },

    draw(pass, view, ctx) {
      drawStarCut(runtime.renderer, pass, view, ctx, 'leaf');
    },

    drawPick(pass, view, ctx) {
      const inputs = runtime.renderer.getFrameCut();
      if (inputs === null) return;
      drawStarPick(runtime.pickRenderer, pass, view, inputs, ctx.drawPxPerRad);
    },
  };
}
