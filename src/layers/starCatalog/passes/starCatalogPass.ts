/**
 * Draws the octree cut's LEAF stream (real stars) into HDR at full
 * resolution; the AGGREGATE stream (flux-mip glows) draws separately at
 * half-res via `starAggregatesPass`, sharing this file's `starCutFor` /
 * `starCatalogVisible` so the two agree. Pick is leaf-only — an aggregate
 * stands for a subtree, no single star to name.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { starCatalogVisible } from '../render/cut/starCatalogVisible';
import { readStarCut } from '../render/cut/readStarCut';
import { starCutFor } from '../render/cut/starCutFor';
import { drawStarStream } from '../render/cut/drawStarStream';
import { drawStarPick } from '../render/cut/drawStarPick';

export function starCatalogPass(runtime: StarCatalogRuntime): ContentPass {
  return {
    name: 'star-catalog',

    enabled(state, ctx, _view) {
      return starCatalogVisible(runtime, state.settings.starCatalogs, ctx);
    },

    draw(pass, view, ctx, state) {
      const prep = starCutFor(runtime, state.settings.starCatalogs, ctx);
      if (prep === null) return;
      drawStarStream(runtime.renderer, pass, view, prep, 'leaf', ctx);
    },

    drawPick(pass, view, ctx, state) {
      const prep = readStarCut(runtime, state.settings.starCatalogs, ctx);
      if (prep === null) return;
      drawStarPick(runtime.pickRenderer, pass, view, prep, ctx.drawPxPerRad);
    },
  };
}
