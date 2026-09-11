/**
 * starAggregatesPass — the survey (Gaia bin) star AGGREGATE stream, drawn
 * LINEAR into the half-res `star-aggregates` offscreen.
 *
 * The fill-bound half of the star pass. Interior octree nodes (flux-mip glows
 * whose radius fills the box footprint × the glow-overlap spread) deposit
 * tens-to-hundreds of full screens of additive overdraw at kpc-scale zoom, so
 * they draw into a half-res target (quartering the fragment cost) instead of
 * straight into HDR. The `star-upsample` layer (`starAggregateUpsamplePass`)
 * then composites this offscreen back, applying the hue-preserving knee to the
 * SUMMED aggregate field. The leaf stream stays full-resolution in HDR
 * (`starCatalogPass`).
 *
 * The per-frame octree walk, LOD-fade advance, and leaf/aggregate partition are
 * ALL shared with the other two star layers via `prepareStarCut` (memoised on
 * `ctx`): this layer draws first in program order (its `star-aggregates` render
 * step precedes the hdr NEAR0 step), so its `draw` typically triggers the walk,
 * and the leaf + upsample layers read the cached result. This layer records
 * ONLY the aggregate sub-stream, via the shared `drawStream` helper with
 * `stream: 'aggregate'` — the renderer's `fsLinear` pipeline into the offscreen.
 *
 * ### Why `enabled` shares `starCatalogVisible`
 *
 * The offscreen is cleared on first touch each frame by the executor. If this
 * layer were gated differently from the `star-upsample` consumer, a frame where
 * the aggregate render is skipped (offscreen NOT cleared, holding stale bytes)
 * but the upsample still ran would composite last frame's aggregates. Sharing
 * one gate is the same stale-offscreen guard the volume liveness projection
 * enforces between the raymarch and its upsample.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { NEAR0 } from '../slabs';
import { starCatalogVisible, prepareStarCut, drawStream } from './starCatalogPass';

export const starAggregatesPass: ContentPass = {
  name: 'star-aggregates',

  enabled: starCatalogVisible,

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starCatalogRenderer;
    if (renderer === null) return;
    const prep = prepareStarCut(state, ctx);
    if (prep === null) return;

    // Viewport is the DESTINATION target's allocated size (see `sizeOf`), not
    // the canvas: STAR_GLOW_MIN_PX floors the glow radius in pixels OF THE
    // TARGET BEING RASTERISED, so the canvas size would make the floor 0.75
    // texels here and land floor-clamped aggregates sub-texel (dropout and
    // flicker, not wrong brightness — `toRefPx` keeps the photometry
    // viewport-independent). `viewSlot !== 0` marks a sky-cubemap capture draw
    // (this pass is on `FRAME_ORDER`'s capture roster — see
    // `ReadyFrameContext.viewSlot`'s doc), which targets the `sky-cubemap`
    // face — its own declared size (a live setting), not this row's. The view
    // is COPIED rather than mutated: one `SlabView` is shared by every pass in
    // the render step.
    const destTarget = ctx.viewSlot !== 0 ? 'sky-cubemap' : 'star-aggregates';
    const { width: vw, height: vh } = ctx.renderTargets.sizeOf(destTarget);

    drawStream(
      renderer,
      pass,
      { ...view, viewportPx: [vw, vh] },
      prep,
      'aggregate',
      ctx.fovYRad,
      ctx.viewSlot,
    );
  },
};
