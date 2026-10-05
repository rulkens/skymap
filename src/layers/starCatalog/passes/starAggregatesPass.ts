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
 * ALL shared with the other star layers via `starCutFor`: the Layer's `frame`
 * hook advances the fades once and sets `computeStarCut`'s result on the
 * renderer before either draws, so this layer and `starCatalogPass` both read
 * that one cut rather than walking again. This layer records ONLY the
 * aggregate sub-stream, via the shared `drawStarStream` helper with
 * `stream: 'aggregate'` — the `fsLinear` pipeline into the offscreen.
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

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { starCatalogVisible } from '../render/cut/starCatalogVisible';
import { starCutFor } from '../render/cut/starCutFor';
import { drawStarStream } from '../render/cut/drawStarStream';

export function starAggregatesPass(runtime: StarCatalogRuntime): ContentPass {
  return {
    name: 'star-aggregates',

    enabled(state, ctx, _view) {
      return starCatalogVisible(runtime, state.settings.starCatalogs, ctx);
    },

    draw(pass, view, ctx, state) {
      const prep = starCutFor(runtime, state.settings.starCatalogs, ctx);
      if (prep === null) return;

      // Viewport is the DESTINATION target's allocated size, not the canvas:
      // STAR_GLOW_MIN_PX floors the glow radius in pixels OF THE TARGET BEING
      // RASTERISED, so the canvas size would make the floor 0.75 texels here and
      // land floor-clamped aggregates sub-texel (dropout and flicker, not wrong
      // brightness — `toRefPx` normalises by this target's own `pxPerRad`, so
      // the photometry holds per solid angle at any target size and fov).
      // `viewKind === 'capture'` marks a capture draw (see `FrameView.viewKind`),
      // whose destination is the capture face: `deriveView(faceViewSpec(...))`
      // builds the synthetic ctx at the row's declared face size, so `canvasSize` already IS
      // that size. The view is COPIED rather than mutated: one `SlabView` is
      // shared by every pass in the render step.
      const { width: vw, height: vh } =
        ctx.viewKind === 'capture'
          ? ctx.canvasSize
          : ctx.snapshot.renderTargets.sizeOf('star-aggregates');

      drawStarStream(
        runtime.renderer,
        pass,
        { ...view, viewportPx: [vw, vh] },
        prep,
        'aggregate',
        ctx,
      );
    },
  };
}
