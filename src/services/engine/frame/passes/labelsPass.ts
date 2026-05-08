/**
 * labelsPass — MSDF text label draw call inside the HDR render pass.
 *
 * ### What it draws
 *
 * World-anchored text labels rendered via the MSDF (multi-channel signed
 * distance field) technique.  Each glyph is an instanced quad whose
 * per-fragment alpha is derived from the font atlas's distance channels,
 * giving crisp anti-aliased edges at any zoom level without requiring
 * mipmaps.  Blend mode is premultiplied-alpha OVER (not additive) — labels
 * are UI overlay, not emissive content.
 *
 * ### When it draws
 *
 * Two conditions must both hold:
 *
 *   1. `state.gpu.labelRenderer` must be non-null.  It's null until the
 *      atlas fetch + `createLabelRenderer` construction complete in
 *      `initGpu.ts`.  The same null-check-at-point-of-use pattern as
 *      `filamentsPass` — optional resources stay off the bootstrap gate.
 *
 *   2. `labelRenderer.glyphCount() > 0` — the `youAreHereSubsystem` must
 *      have called `setLabels` with at least one label this frame.  When
 *      the camera is far from the origin (the common case) the subsystem
 *      sets an empty label array and `glyphCount()` returns 0, making this
 *      pass a cheap early-return.
 *
 * ### Pass position in the HDR sequence
 *
 * Placed AFTER `milkyWayPass` (the last existing HDR entry) and AFTER
 * `markerLinesPass` (so the line draws beneath its own label, not on top
 * of it).  Labels are a UI overlay drawn last in the HDR sequence so they
 * composite above all 3D content before tone-mapping.  Tone-map operates on
 * the composited HDR target, so white labels are kept white — not
 * over-brightened by the exposure curve.
 *
 * ### What it reads
 *
 * - `state.gpu.labelRenderer` — the MSDF renderer (null-checked by `enabled`)
 * - `ctx.vp` — the current view-projection matrix (Float32Array)
 * - `ctx.canvasSize` — viewport pixel dimensions
 */

import type { Pass } from './types';

export const labelsPass: Pass = {
  name: 'labels',

  enabled(state, _ctx, _settings) {
    // Optional renderer — null until the atlas fetch finishes and initGpu
    // constructs it.  Same null-check-at-point-of-use pattern as
    // filamentsPass.enabled: when the renderer isn't ready the pass is
    // simply skipped, never blocking the engine.
    if (state.gpu.labelRenderer === null) return false;
    return state.gpu.labelRenderer.glyphCount() > 0;
  },

  draw(pass, ctx, state, _settings, _deps) {
    // `enabled()` proved labelRenderer is non-null and has at least one glyph.
    // The `!` assertion is safe: the type checker can't see that `enabled`
    // ran first, but by convention the pass framework only calls `draw` when
    // `enabled` returns true.
    state.gpu.labelRenderer!.render(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
    );
  },
};
