/**
 * markerLinesPass — screen-space thick-line overlay draw call inside the
 * HDR render pass.
 *
 * ### What it draws
 *
 * World-anchored line segments rendered as instanced thick quads.  Each
 * line expands into a screen-aligned rectangle between two world-space
 * endpoints; the fragment stage applies a smooth one-pixel anti-aliased
 * falloff perpendicular to the line axis.  Blend mode is premultiplied-alpha
 * OVER (not additive) — marker lines are UI overlay, not emissive content.
 *
 * ### When it draws
 *
 * Two conditions must both hold:
 *
 *   1. `state.gpu.markerLineRenderer` must be non-null.  It's null until
 *      `createMarkerLineRenderer` construction completes in `initGpu.ts`
 *      (alongside the label renderer).  Same null-check-at-point-of-use
 *      pattern as `filamentsPass` and `labelsPass`.
 *
 *   2. `markerLineRenderer.lineCount() > 0` — the `youAreHereSubsystem`
 *      must have called `setLines` with at least one line this frame.  When
 *      the camera is far from the origin the subsystem sets an empty line
 *      array and `lineCount()` returns 0, making this pass a cheap
 *      early-return.
 *
 * ### Pass position in the HDR sequence
 *
 * Placed AFTER `milkyWayPass` and BEFORE `labelsPass`.  Drawing the line
 * before the label ensures the line is never rendered on top of its own
 * label text — the label composites over the line at the pixels where they
 * overlap, preserving text legibility.
 *
 * ### What it reads
 *
 * - `state.gpu.markerLineRenderer` — the thick-line renderer (null-checked
 *   by `enabled`)
 * - `ctx.vp` — the current view-projection matrix (Float32Array)
 * - `ctx.canvasSize` — viewport pixel dimensions
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const markerLinesPass: Pass = {
  name: 'marker-lines',

  enabled(state, _ctx, _settings) {
    // Optional renderer — null until initGpu constructs it alongside the
    // label renderer.  Same null-check-at-point-of-use pattern as
    // filamentsPass.enabled: when the renderer isn't ready the pass is
    // simply skipped.
    if (state.gpu.markerLineRenderer === null) return false;
    return state.gpu.markerLineRenderer.lineCount() > 0;
  },

  draw(pass, ctx, state, _settings, _deps) {
    // `enabled()` proved markerLineRenderer is non-null and has at least
    // one line.  The `!` assertion is safe: the pass framework only calls
    // `draw` when `enabled` returns true.
    state.gpu.markerLineRenderer!.render(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
    );
  },
};
