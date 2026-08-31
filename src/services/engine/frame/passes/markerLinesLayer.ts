/**
 * markerLinesLayer — screen-space thick-line overlay draw call.
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
 * World-anchored line segments rendered as instanced thick quads.
 * Each line expands into a screen-aligned rectangle between two
 * world-space endpoints; the fragment stage applies a smooth one-
 * pixel anti-aliased falloff perpendicular to the line axis.  Blend
 * mode is premultiplied-alpha OVER (not additive) — marker lines
 * are UI overlay, not emissive content.
 *
 * ### When it draws
 *
 * Two conditions must both hold:
 *
 *   1. `state.gpu.markerLineRenderer` must be non-null.  It's null
 *      until `createMarkerLineRenderer` construction completes in
 *      `initGpu.ts`.
 *
 *   2. `markerLineRenderer.lineCount() > 0` — the label director must
 *      have called `setLines` with at least one line this frame (e.g.
 *      the `produceMilkyWayLabel` stem).  When the camera is far from
 *      the origin the producer emits an empty line set and `lineCount()`
 *      returns 0, making this layer a cheap early-return.
 *
 * ### Position among the swap-target layers
 *
 * Placed BEFORE `labelsLayer` so the label text composites over the
 * line where they overlap, preserving readability.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';

export const markerLinesLayer: ContentLayer = {
  name: 'marker-lines',
  slab: COSMO,
  target: 'swap',
  blend: 'over',

  enabled(state, _ctx, _view) {
    if (state.gpu.markerLineRenderer === null) return false;
    return state.gpu.markerLineRenderer.lineCount() > 0;
  },

  draw(pass, view, ctx, state) {
    // Occlude the leader lines per-pixel behind an opaque body ONLY when the
    // body pass actually ran this frame — else the `foreground:0` colour is
    // stale/uninitialised and would spuriously blank every line. When
    // undefined, the occlusion renderer falls back to its plain pipeline and
    // draws the lines un-occluded. Mirrors `foregroundLabelsLayer`'s guard.
    const colorView = ctx.renderedTargets.has('foreground:0')
      ? ctx.renderTargets.viewOf('foreground:0')
      : undefined;
    // `enabled()` proved markerLineRenderer is non-null and has at least
    // one line.  The `!` assertion is safe: the framework only calls
    // `draw` when `enabled` returns true.
    state.gpu.markerLineRenderer!.draw(pass, view.vp, view.viewportPx, colorView);
  },
};
