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
 * shader sees a single integer.  Sentinel choice: `0xFFFFFFFF` is
 * the max u32, well outside any realistic packed identity (the top
 * 5 bits would have to encode source code 31, which we don't
 * currently allocate).
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import type { FocusUniformsValue } from '../../../../@types/rendering/FocusUniformsValue';
import {
  packSelection,
  SELECTION_NONE_SENTINEL,
} from '../../../../data/selectionEncoding';

// At-rest cluster-focus value: blend 0 makes the shader's per-vertex
// focus multiplier collapse to 1.0 (no dim).  Used until the
// clusterFocusSubsystem's live output is threaded through the frame
// settings; mirrors the subsystem's own ZERO_FOCUS sentinel.
const AT_REST_FOCUS: FocusUniformsValue = {
  center: [0, 0, 0],
  radiusMpc: 0,
  blend: 0,
  invert: 0,
};

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
    // "nothing selected" sentinel.  See module header for sentinel rationale.
    const selectedPacked =
      settings.selected !== null && settings.selected.kind === 'galaxy'
        ? packSelection(settings.selected.source, settings.selected.localIdx)
        : SELECTION_NONE_SENTINEL;

    // Capture the fade registry + timestamp once for this frame so the
    // per-source closure below doesn't call performance.now() per source.
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
      // Task 8 (procedural-disk-impostor): the points-pass fragment
      // fades alpha to zero across this same apparent-pixel-size band
      // that the procedural-disk pass fades IN over.  Both thresholds
      // come from `subsystems/thumbnailSubsystem`'s exported constants
      // — single source of truth shared between the two passes so
      // they can never drift apart and re-introduce the double-bright
      // donut artefact.
      pxFadeStart: settings.pxFadeStartPoints,
      pxFadeEnd: settings.pxFadeEndPoints,
      // Cluster-focus state for the @group(3) FocusUniforms binding.
      // At-rest value (blend 0) keeps the shader's per-vertex multiplier
      // at 1.0 — no visible effect.  When the clusterFocusSubsystem is
      // threaded through RenderFrameSettings it will produce the live
      // value each frame; this literal is the no-op default until then.
      focus: AT_REST_FOCUS,
      // Look up the FadeRegistry opacity for each source at this frame's
      // timestamp. The registry returns 1.0 for unregistered handles —
      // a safe fallback so a source that hasn't registered yet renders
      // at full opacity rather than disappearing.
      fadeOpacityOf: (source) => fades.opacityOf({ kind: 'survey', source }, nowMs),
    });
  },
};
