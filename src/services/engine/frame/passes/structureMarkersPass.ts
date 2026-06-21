/**
 * structureMarkersPass — halo + ring draws for every structure category
 * (cluster / supercluster / void / group).
 *
 * Lives in `HDR_PASSES` (NOT `UI_PASSES`) because halos are additive
 * emissive content — they participate in tone-map alongside point
 * sprites, procedural disks, etc.  Rings are premultiplied-OVER but
 * the alpha is already in the linear HDR range; tone-map applies
 * cleanly.
 *
 * Position: after volumeUpsamplePass so halos composite over the
 * cosmic web / volume fields rather than the other way round.  Labels
 * (in UI_PASSES) still draw on top of everything HDR via the post-
 * tone-map overlay pass.
 *
 * Enabled when: structureMarkerRenderer is non-null AND has at least
 * one marker queued for this frame.  When the camera is sufficiently
 * far that every ring is sub-pixel, the renderer
 * still emits descriptors (the per-pixel fragment write degenerates
 * to ~zero alpha) — this is intentional, keeps the pass cheap and
 * uniformly enabled.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const structureMarkersPass: Pass = {
  name: 'structure-markers',

  enabled(state, _ctx) {
    if (state.gpu.structureMarkerRenderer === null) return false;
    return state.gpu.structureMarkerRenderer.markerCount() > 0;
  },

  draw(pass, ctx, state, _deps) {
    // fadeOpacity = 1 at v1 — the structure-markers layer has no
    // FadeRegistry handle yet.  The renderer still binds a real fade
    // group at @group(1) so the BGL matches what filaments (and other
    // HDR passes) bind at the same slot on the shared encoder.  A
    // future opacityOf({kind:'structureMarkers'}, nowMs) substitution
    // would let the layer animate in/out via the unified fade
    // architecture (see lib/fadeUniforms.wesl module header).
    state.gpu.structureMarkerRenderer!.render(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
      1,
    );
  },
};
