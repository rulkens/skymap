/**
 * starCatalogPass — the survey (Gaia bin) stars as additive point sprites in
 * the depthless HDR accumulation, the wide-field twin of `starPointsPass`.
 *
 * ### The two-stream split (leaf here, aggregate + composite in siblings)
 *
 * The octree cut splits into two visual species with very different GPU cost:
 * LEAF nodes (childless, real point-source stars) are trivial fill; AGGREGATE
 * nodes (interior flux-mip glows) are the fill-bound bulk of the pass. So the
 * streams draw into different targets:
 *
 *   - `starCatalogPass` (this file) draws the LEAF stream at full resolution
 *     into the HDR target, via `drawStarStream` (`renderers/starCatalog/cut/`).
 *   - `starAggregatesPass` draws the AGGREGATE stream into the half-res
 *     `star-aggregates` offscreen, via that SAME `drawStarStream`.
 *   - `starAggregateUpsamplePass` composites that offscreen back into HDR.
 *
 * All three share ONE per-frame CPU pass, `prepareStarCut`, which walks the
 * octree via `computeStarCut` and partitions each drawn node into the leaf or
 * aggregate stream. `runFrame` advances the per-node LOD fades once per frame
 * via `advanceStarFades`; `prepareStarCut` itself only ever reads the cached
 * result. All three layers gate on the shared `starCatalogVisible` projection,
 * so the aggregate producer and its upsample consumer can never disagree.
 *
 * ### Pickable (leaf stars only), and the Sun-exclusion note
 *
 * The Gaia bin IS pickable: `drawPick` below hands off to `drawStarPick`,
 * which stamps every visible LEAF star's packed identity into the NEAR0
 * r32uint pick pass. AGGREGATE glows are never pickable — a flux mip that
 * stands in for a whole subtree has no single star to name. The Sun is
 * excluded from the catalog at build time (it is the origin, drawn by the
 * true-scale `starSpheresPass`/`starPointsPass` seed), so the octree carries
 * no record at [0,0,0] to double the local starfield.
 *
 * See `computeStarCut` for the NEAR0/f64 rebase seam and per-node LOD fades,
 * `starFadeState` for the fade bookkeeping, `starCatalogVisible` for the
 * crossfade gate, and `drawStarStream` for the shared-vp draw invariant.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { starCatalogVisible } from '../../../gpu/renderers/starCatalog/cut/starCatalogVisible';
import { prepareStarCut } from '../../../gpu/renderers/starCatalog/cut/prepareStarCut';
import { drawStarStream } from '../../../gpu/renderers/starCatalog/cut/drawStarStream';
import { drawStarPick } from '../../../gpu/renderers/starCatalog/cut/drawStarPick';

export const starCatalogPass: ContentPass = {
  name: 'star-catalog',

  enabled: starCatalogVisible,

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starCatalogRenderer;
    if (renderer === null) return;
    const prep = prepareStarCut(state, ctx);
    if (prep === null) return;
    // The LEAF stream: full-resolution point stars into HDR, per-glow knee.
    drawStarStream(renderer, pass, view, prep, 'leaf', ctx.fovYRad, ctx.viewSlot);
  },

  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.starCatalogPickRenderer;
    if (pickRenderer === null) return;
    const prep = prepareStarCut(state, ctx);
    if (prep === null) return;
    drawStarPick(pickRenderer, pass, view, ctx.fovYRad, prep);
  },
};
