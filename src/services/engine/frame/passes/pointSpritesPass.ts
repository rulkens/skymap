/**
 * pointSpritesPass — instanced point-billboard draw, the headline
 * HDR pass.
 *
 * ### What it draws
 *
 * Every loaded galaxy from every visible source rendered as a
 * screen-space-aligned billboard with magnitude-driven size and a
 * per-source colour-index mapping.  Pure additive blending against
 * the HDR offscreen target — overlap regions naturally bloom bright
 * before tone-mapping compresses them back to displayable range.
 *
 * ### When it draws
 *
 * Always — there's no user-facing toggle for "hide all the points".
 * `enabled` returns `true` unconditionally; the pass remains a
 * fixed-cost contribution to every frame.  Visibility is gated
 * inside the shader instead, via the `visibleSourceMask` uniform
 * (so disabling SDSS is a 4-byte uniform write, not a CPU-side
 * skip).
 *
 * ### What it reads
 *
 * - `ctx.renderer` (the bootstrap-narrowed `PointRenderer`)
 * - `ctx.vp` — view-projection matrix
 * - `ctx.canvasSize` — backing-store viewport dimensions
 * - `ctx.drawCamPos` — camera position, fed to the shader's parallax
 *   + brightness terms
 * - `ctx.drawPxPerRad` — radian→pixel scale for apparent-size
 *   computation
 * - The whole `RenderFrameSettings` block — every entry of the
 *   17-arg `pointRenderer.draw` call originates either there or in
 *   `ctx`.  See `renderFrame.ts`'s `RenderFrameSettings` shape for
 *   the per-field rationale.
 *
 * ### Selection-packed encoding
 *
 * The shader expects a single u32 in the form
 * `(sourceCode << 27) | localIdx` to identify the selected galaxy
 * (or `0xFFFFFFFF` for "nothing selected").  Settings carries the
 * structured `{ source, localIdx } | null` shape; we translate to
 * the packed u32 here so settings stays in plain-TS-land and the
 * shader sees a single integer.  Sentinel choice: `0xFFFFFFFF` is
 * the max u32, well outside any realistic packed identity (the top
 * 5 bits would have to encode source code 31, which we don't
 * currently allocate).
 */

import type { Pass } from './types';

export const pointSpritesPass: Pass = {
  name: 'point-sprites',

  // Always-on.  Per-source visibility is shader-side (uniform mask),
  // not CPU-side gating.
  enabled() {
    return true;
  },

  draw(pass, ctx, _state, settings, _deps) {
    const { renderer, vp, canvasSize, drawCamPos, drawPxPerRad } = ctx;
    const { width, height } = canvasSize;

    // Pack the `(source, localIdx)` selection into the u32 the shader
    // compares against per-vertex `(sourceCode << 27u) | instance_index`.
    // See module header for the sentinel rationale.
    const selectedPacked =
      settings.selected !== null
        ? ((settings.selected.source << 27) | settings.selected.localIdx) >>> 0
        : 0xffffffff >>> 0;

    renderer.draw(
      pass,
      vp,
      [width, height],
      settings.pointSizePx,
      settings.brightness,
      selectedPacked,
      settings.visibleSourceMask,
      drawCamPos,
      drawPxPerRad,
      settings.highlightFallback,
      settings.realOnlyMode,
      settings.biasMode,
      settings.absMagLimit,
      settings.apparentMagLimit,
      settings.schechterMStar,
      settings.schechterAlpha,
      settings.depthFadeEnabled,
      // Task 8 (procedural-disk-impostor): the points-pass fragment
      // fades alpha to zero across this same apparent-pixel-size band
      // that the procedural-disk pass fades IN over.  Both thresholds
      // come from `subsystems/thumbnailSubsystem`'s exported constants
      // — single source of truth shared between the two passes so
      // they can never drift apart and re-introduce the double-bright
      // donut artefact.
      settings.pxFadeStartPoints,
      settings.pxFadeEndPoints,
    );
  },
};
