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
 * Per-source visibility is gated inside the shader via the
 * `visibleSourceMask` uniform, so disabling SDSS is a 4-byte uniform
 * write, not a CPU-side skip.
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
 * - The whole `RenderFrameSettings` block — every field of the
 *   `PointDrawSettings` object passed to `pointRenderer.draw`
 *   originates either there or in `ctx`.  See `renderFrame.ts`'s
 *   `RenderFrameSettings` shape for the per-field rationale.
 *
 * ### Selection-packed encoding
 *
 * The shader expects a single u32 in the form
 * `(sourceCode << 27) | localIdx` to identify the selected galaxy
 * (or `0xFFFFFFFF` for "nothing selected").  Settings carries the
 * structured `{ source, localIdx } | null` shape; we translate to
 * the packed u32 here so settings stays in plain-TS-land and the
 * shader sees a single integer.  `0xFFFFFFFF` is the sentinel: the
 * max u32, well outside any realistic packed identity (the top 5
 * bits would have to encode source code 31, which we don't allocate).
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import {
  packSelection,
  SELECTION_NONE_SENTINEL,
} from '../../../../data/selectionEncoding';

export const pointSpritesPass: Pass = {
  name: 'point-sprites',

  // Always-on.  Per-source visibility is shader-side (uniform mask),
  // not CPU-side gating.
  enabled() {
    return true;
  },

  draw(pass, ctx, state, settings, _deps) {
    const { renderer, vp, canvasSize, drawCamPos, drawPxPerRad } = ctx;
    const { width, height } = canvasSize;

    // Pack the galaxy selection into the u32 the shader compares
    // against per-vertex `(sourceCode << 27u) | instance_index`.  POI
    // selections don't light up galaxy halos, so they map to the
    // "nothing selected" sentinel.
    const selectedPacked =
      settings.selected !== null && settings.selected.kind === 'galaxy'
        ? packSelection(settings.selected.source, settings.selected.localIdx)
        : SELECTION_NONE_SENTINEL;

    // Capture the fade registry + timestamp once so the per-source
    // closure below doesn't call performance.now() per source.
    const nowMs = performance.now();
    const fades = state.subsystems.fades;

    renderer.draw(pass, vp, [width, height], {
      pointSizePx: settings.pointSizePx,
      brightness: settings.brightness,
      selectedPacked,
      visibleSourceMask: settings.visibleSourceMask,
      camPosWorld: drawCamPos,
      pxPerRad: drawPxPerRad,
      highlightFallback: settings.highlightFallback,
      realOnlyMode: settings.realOnlyMode,
      biasMode: settings.biasMode,
      absMagLimit: settings.absMagLimit,
      apparentMagLimit: settings.apparentMagLimit,
      schechterMStar: settings.schechterMStar,
      schechterAlpha: settings.schechterAlpha,
      depthFadeEnabled: settings.depthFadeEnabled,
      // The points-pass fragment fades alpha to zero across the same
      // apparent-pixel-size band the procedural-disk pass fades IN over.
      // Both thresholds come from one source of truth so they can't drift
      // apart and re-introduce the double-bright donut artefact.
      pxFadeStart: settings.pxFadeStartPoints,
      pxFadeEnd: settings.pxFadeEndPoints,
      // Shared cluster-focus bind group (@group(3)). The engine owns the
      // single focus buffer (written once per frame in renderFrame); we
      // bind its group. At rest (blend 0) the shader multiplier is 1.0.
      focusBindGroup: state.gpu.focusUniform!.bindGroup,
      // Look up the FadeRegistry opacity for each source at this frame's
      // timestamp. The registry returns 1.0 for unregistered handles —
      // a safe fallback so a source that hasn't registered yet renders
      // at full opacity rather than disappearing.
      fadeOpacityOf: (source) => fades.opacityOf({ kind: 'survey', source }, nowMs),
    });
  },
};
