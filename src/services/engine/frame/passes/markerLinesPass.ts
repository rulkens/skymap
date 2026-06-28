/**
 * markerLinesPass — screen-space thick-line overlay draw call.
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
 *      returns 0, making this pass a cheap early-return.
 *
 * ### Pass position in UI_PASSES
 *
 * Placed BEFORE `labelsPass` so the label text composites over the
 * line where they overlap, preserving readability.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const markerLinesPass: Pass = {
  name: 'marker-lines',

  enabled(state, _ctx) {
    if (state.gpu.markerLineRenderer === null) return false;
    return state.gpu.markerLineRenderer.lineCount() > 0;
  },

  draw(pass, ctx, state, _deps) {
    // `enabled()` proved markerLineRenderer is non-null and has at least
    // one line.  The `!` assertion is safe: the pass framework only calls
    // `draw` when `enabled` returns true.
    state.gpu.markerLineRenderer!.draw(pass, ctx.vp as Float32Array, [
      ctx.canvasSize.width,
      ctx.canvasSize.height,
    ]);
  },
};
