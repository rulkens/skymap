/**
 * labelsPass — MSDF text label draw call.
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
 *   2. `cosmoLabelDirector.labels()` is non-empty — the director must
 *      have flushed at least one label this frame (e.g. from
 *      `produceMilkyWayLabel`).  When the camera is far from the origin the
 *      producer emits an empty label set, making this layer a cheap
 *      early-return.
 *
 * ### Position among the swap-target layers
 *
 * Placed AFTER `markerLinesPass` so the label text composites over
 * the line where they overlap, preserving readability.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';
import { cosmoLabelProjection } from '../cosmoLabelProjection';
import { hasPickableLabel } from '../../../../utils/labels/hasPickableLabel';
import { labelPickQuads } from '../../../../utils/labels/labelPickQuads';

export const labelsPass: ContentPass = {
  name: 'labels',

  enabled(state, _ctx, _view) {
    if (state.gpu.labelRenderer === null) return false;
    return state.subsystems.cosmoLabelDirector.labels().length > 0;
  },

  // Pick gate — NARROWER than `enabled`: a drawn label only invites a click
  // when it names a selectable subject, and a frame of pure decoration (the
  // constellation captions carry no `pickId`) must not pull an r32uint pick
  // target into existence for a draw that would stamp nothing.
  pickEnabled(state, _ctx) {
    if (state.gpu.labelRenderer === null) return false;
    return hasPickableLabel(state.subsystems.cosmoLabelDirector.labels());
  },

  draw(pass, view, ctx, state) {
    // Every COSMO label carries occludeWeight 1, so only the coverage half of
    // the joint decides anything here — the depth half is bound because the
    // pipeline layout demands it, and reads as a no-op against the labels'
    // zero cutoff.
    state.gpu.labelRenderer!.draw(
      pass,
      view.vp,
      view.viewportPx,
      ctx.drawPxPerRad,
      overlaySceneOcclusion(ctx, view),
    );
  },

  // Pick aspect — grace-padded ink boxes for the drawn labels, stamped with
  // each subject's own packed id (see `labelPickQuads`), from the SAME
  // projection the director declutters through, resolved fresh per pick call
  // so the boxes track where the glyphs are now.
  //
  // Scene occlusion is deliberately NOT reproduced: the visual pass fades
  // caption pixels behind a nearer body (`fragmentOcclude`), which the flat
  // pick quad can't see — so an occluded label stays clickable. Pick wider
  // than draw is the safe direction for a click affordance.
  drawPick(pass, _view, ctx, state) {
    const pickRenderer = state.gpu.labelPickRenderer;
    const textLayout = state.gpu.textLayout;
    if (pickRenderer === null || textLayout === null) return;

    const projection = cosmoLabelProjection(ctx);
    const quads = labelPickQuads({
      labels: state.subsystems.cosmoLabelDirector.labels(),
      projection,
      measure: (label) => textLayout.measure(label),
    });
    pickRenderer.draw(pass, quads, projection.viewportPx);
  },
};
