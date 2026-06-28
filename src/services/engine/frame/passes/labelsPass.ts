/**
 * labelsPass — MSDF text label draw call.
 *
 * Lives in `UI_PASSES`, NOT `HDR_PASSES` — see `passes/index.ts`
 * module header for why marker-lines + labels moved out of the HDR
 * sequence.  `uiOverlay` opens one `beginRenderPass` on the swap-
 * chain texture and iterates `UI_PASSES` inside that single pass,
 * so this pass's `draw` writes directly to the tone-mapped swap
 * chain without further compression.
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
 *      `glyphCount()` returns 0, making this pass a cheap early-return.
 *
 * ### Pass position in UI_PASSES
 *
 * Placed AFTER `markerLinesPass` so the label text composites over
 * the line where they overlap, preserving readability.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const labelsPass: Pass = {
  name: 'labels',

  enabled(state, _ctx) {
    if (state.gpu.labelRenderer === null) return false;
    return state.gpu.labelRenderer.glyphCount() > 0;
  },

  draw(pass, ctx, state, _deps) {
    state.gpu.labelRenderer!.draw(pass, ctx.vp as Float32Array, [
      ctx.canvasSize.width,
      ctx.canvasSize.height,
    ]);
  },
};
