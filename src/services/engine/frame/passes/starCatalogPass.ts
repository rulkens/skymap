/**
 * Draws the octree cut's LEAF stream (real stars) into HDR at full
 * resolution; the AGGREGATE stream (flux-mip glows) draws separately at
 * half-res via `starAggregatesPass`, sharing this file's `readStarCut` /
 * `starCatalogVisible` so the two agree. Pick is leaf-only — an aggregate
 * stands for a subtree, no single star to name.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { starCatalogVisible } from '../../../gpu/renderers/starCatalog/cut/starCatalogVisible';
import { readStarCut } from '../../../gpu/renderers/starCatalog/cut/readStarCut';
import { drawStarStream } from '../../../gpu/renderers/starCatalog/cut/drawStarStream';
import { drawStarPick } from '../../../gpu/renderers/starCatalog/cut/drawStarPick';

export const starCatalogPass: ContentPass = {
  name: 'star-catalog',

  enabled: starCatalogVisible,

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starCatalogRenderer;
    if (renderer === null) return;
    const prep = readStarCut(state, ctx);
    if (prep === null) return;
    drawStarStream(renderer, pass, view, prep, 'leaf', ctx);
  },

  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.starCatalogPickRenderer;
    if (pickRenderer === null) return;
    const prep = readStarCut(state, ctx);
    if (prep === null) return;
    drawStarPick(pickRenderer, pass, view, prep, ctx.fovYRad);
  },
};
