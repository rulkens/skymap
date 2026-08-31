/**
 * labelsLayer — MSDF text label draw call.
 *
 * A swap-target layer, NOT an hdr-target one — see `passes/index.ts`
 * module header for why marker-lines + labels moved out of the HDR
 * sequence.  The swap render step opens one `beginRenderPass` on the
 * swap-chain texture and iterates the swap-target layers inside that
 * single pass, so this layer's `draw` writes directly to the
 * tone-mapped swap chain without further compression.
 *
 * ### What it draws
 *
 * World-anchored text labels rendered via the MSDF (multi-channel
 * signed distance field) technique.  Each glyph is an instanced
 * quad whose per-fragment alpha is derived from the font atlas's
 * distance channels, giving crisp anti-aliased edges at any zoom
 * level without requiring mipmaps.  Blend mode is premultiplied-
 * alpha OVER (not additive) — labels are UI overlay, not emissive
 * content.
 *
 * ### When it draws
 *
 * Two conditions must both hold:
 *
 *   1. `state.gpu.labelRenderer` must be non-null.  It's null until
 *      the atlas fetch + `createLabelRenderer` construction complete
 *      in `initGpu.ts`.
 *
 *   2. `labelRenderer.glyphCount() > 0` — the label director must
 *      have called `setLabels` with at least one label this frame
 *      (e.g. from `produceMilkyWayLabel`).  When the camera is far
 *      from the origin the producer emits an empty label set and
 *      `glyphCount()` returns 0, making this layer a cheap early-return.
 *
 * ### Position among the swap-target layers
 *
 * Placed AFTER `markerLinesLayer` so the label text composites over
 * the line where they overlap, preserving readability.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { cosmoLabelProjection } from '../cosmoLabelProjection';
import { hasPickableLabel, labelPickQuads } from './labelPickQuads';

export const labelsLayer: ContentLayer = {
  name: 'labels',
  slab: COSMO,
  target: 'swap',
  blend: 'over',

  enabled(state, _ctx) {
    if (state.gpu.labelRenderer === null) return false;
    return state.gpu.labelRenderer.glyphCount() > 0;
  },

  // Pick gate — NARROWER than `enabled`: a drawn label only invites a click
  // when it names a selectable subject, and a frame of pure decoration (the
  // constellation captions carry no `pickId`) must not pull an r32uint pick
  // target into existence for a draw that would stamp nothing.
  pickEnabled(state, _ctx) {
    const renderer = state.gpu.labelRenderer;
    if (renderer === null || renderer.glyphCount() === 0) return false;
    return hasPickableLabel(renderer.packedLabels());
  },

  draw(pass, view, ctx, state) {
    // Occlude the captions per-pixel behind nearer bodies ONLY when the body
    // pass actually ran this frame — else the `foreground:0` depth is
    // stale/uninitialised and would spuriously discard every caption. When
    // undefined, the occlusion renderer falls back to its plain pipeline and
    // draws the captions un-occluded. Mirrors `foregroundLabelsLayer`'s guard.
    const depthView = ctx.renderedTargets.has('foreground:0')
      ? ctx.renderTargets.depthViewOf('foreground:0')
      : undefined;
    state.gpu.labelRenderer!.draw(pass, view.vp, view.viewportPx, depthView);
  },

  // Pick aspect — grace-padded ink boxes for the drawn labels, stamped with
  // each subject's own packed id (see `labelPickQuads`), from the SAME
  // projection the director declutters through, resolved fresh per pick call
  // so the boxes track where the glyphs are now.
  //
  // Depth occlusion is deliberately NOT reproduced: the visual pass discards
  // caption pixels behind a nearer body (`fragmentOcclude`), which the flat
  // pick quad can't see — so an occluded label stays clickable. Pick wider
  // than draw is the safe direction for a click affordance.
  drawPick(pass, _view, ctx, state) {
    const renderer = state.gpu.labelRenderer;
    const pickRenderer = state.gpu.labelPickRenderer;
    if (renderer === null || pickRenderer === null) return;

    const projection = cosmoLabelProjection(ctx);
    const quads = labelPickQuads({
      labels: renderer.packedLabels(),
      projection,
      measure: (label) => renderer.measure(label),
    });
    pickRenderer.draw(pass, quads, projection.viewportPx);
    // Postcondition: this row bound its OWN @group(0), so put the shared
    // point-pick camera prefix back for anything recorded after it in the
    // COSMO pick pass (see `ContentLayer.drawPick`).
    state.gpu.galaxyPickRenderer?.bindCamera(pass);
  },
};
