/**
 * Draws the octree cut's LEAF stream (real stars) into HDR at full
 * resolution; the AGGREGATE stream (flux-mip glows) draws separately at
 * low-res via `starAggregatesPass`, sharing `drawStarCut` /
 * `starCatalogVisible` so the two agree. Pick is leaf-only — an aggregate
 * stands for a subtree, no single star to name.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { starCatalogVisible } from '../../octreeCut/render/starCatalogVisible';
import { drawStarCut } from '../../octreeCut/render/drawStarCut';
import { drawStarPick } from '../../octreeCut/render/drawStarPick';

export function starCatalogPass(runtime: StarCatalogRuntime): ContentPass<'starCatalog'> {
  return {
    name: 'star-catalog',
    fade: 'starCatalog',

    enabled: (_state, _ctx, _view, fade) => starCatalogVisible(runtime, fade),

    draw(pass, view, ctx) {
      drawStarCut(runtime.renderer, pass, view, ctx, 'leaf');
    },

    drawPick(pass, view, ctx) {
      const inputs = runtime.renderer.getFrameCut();
      if (inputs === null) return;
      runtime.renderer.snapshotPickSlots();
      drawStarPick(runtime.pickRenderer, pass, view, inputs, ctx.drawPxPerRad, ctx.snapshot.focus);
    },
  };
}
