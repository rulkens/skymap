/**
 * milkyWayPass — procedural Milky Way impostor at the world origin.
 *
 * ### What it draws
 *
 * A view-aligned billboard centred on the world origin (the Milky
 * Way's adopted barycentre in catalogue coordinates) carrying a
 * full-screen procedural raymarched spiral.  Both vertex and
 * fragment stages consume the live world-space camera position so
 * the synthetic vantage rotates with the user's orbit instead of
 * presenting the same hard-coded view every frame.
 *
 * ### When it draws
 *
 * Two gates, both in `enabled`:
 *
 *   1. `state.settings.milkyWay.enabled` — user toggle.
 *   2. `milkyWayFadeAlpha(camDist, fovY, viewportH) > 0` — the
 *      apparent-size fade band defined in
 *      `services/gpu/galaxy/milkyWayFadeAlpha.ts` (full strength while the
 *      disc spans at least `MILKY_WAY_FADE_FULL_PX` on screen, gone once it
 *      shrinks to `MILKY_WAY_FADE_GONE_PX`).
 *
 * Both gates live in `enabled` so that when the camera flies well
 * beyond the local volume the whole pass is skipped — no
 * `beginRenderPass`, no tile-RAM round-trip on M1, and no idle
 * timestamp slot in the GPU-timings panel.  `milkyWayFadeAlpha` is
 * called again inside `draw` to compute the actual alpha to send to
 * the shader; both reads use the frame-frozen `ctx.drawCamPos`, so
 * they return the same value (no race).
 *
 * ### What it reads
 *
 * - `deps.milkyWayCloudRenderer` (the two-pass star/dust draw)
 * - `state.gpu.milkyWayCloud` (the generated instance buffers)
 * - `ctx.cam` (billboard basis), `ctx.vp`, `ctx.canvasSize`, `ctx.drawCamPos`
 * - `state.settings.milkyWay.enabled` (user toggle, via the gate)
 *
 * ### Why drawn LAST inside the HDR pass
 *
 * Same rationale as the pre-D.2 inline ordering: additive blending
 * makes per-fragment colour mathematically commutative, but the
 * deterministic record points → thumbnails → filaments → milky-way
 * keeps the encoder bit-stable across HMR reloads and matches the
 * conceptual layering "background catalogue → cluster overlays →
 * local-universe skeleton → bright foreground feature".
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { milkyWayFadeAlpha } from '../../../gpu/galaxy/milkyWayFadeAlpha';
import { cameraBillboardBasis } from '../../../../utils/camera/cameraBillboardBasis';
import { milkyWayModelMatrix } from '../../../gpu/galaxy/milkyWayModelMatrix';

// The cloud's world placement never changes (fixed galactic orientation +
// scale, world origin), so build the model matrix once and reuse the same
// Float32Array every frame rather than re-deriving twelve products per draw.
let milkyWayModel: Float32Array | null = null;

export const milkyWayPass: Pass = {
  name: 'milky-way',

  enabled(state, ctx) {
    // State boolean is the user's intent; opacityOf > 0 keeps the
    // pass alive through the ~100 ms toggle fade-out tail. The
    // apparent-size milkyWayFadeAlpha still gates separately — once the
    // disc shrinks below a few on-screen pixels there is nothing worth
    // rendering, so skip even when the toggle is on.
    const togglePart =
      state.settings.milkyWay.enabled ||
      state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, performance.now()) > 0;
    if (!togglePart) return false;
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return milkyWayFadeAlpha(camDistMpc, ctx.fovYRad, ctx.canvasSize.height) > 0;
  },

  draw(pass, ctx, state, deps) {
    // The cloud buffers live on `state.gpu` (nullable, like every GPU handle)
    // rather than in `deps`. They are non-null once the frame loop runs, but
    // `enabled` doesn't narrow them, so guard here — the pre-bootstrap window
    // is the only case this fires.
    const cloud = state.gpu.milkyWayCloud;
    if (cloud === null) return;

    const { vp, canvasSize, drawCamPos } = ctx;
    const camDistMpc = Math.hypot(drawCamPos[0], drawCamPos[1], drawCamPos[2]);
    // Composite the apparent-size fade with the registry-supplied
    // toggle opacity. The renderer accepts a scalar fadeAlpha CPU-side
    // param, so multiplying two opacities here is the minimal-change
    // path — no shader edits, no FadeUniforms binding.
    const toggleOpacity = state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, performance.now());
    const fadeAlpha = milkyWayFadeAlpha(camDistMpc, ctx.fovYRad, canvasSize.height) * toggleOpacity;

    // Camera-facing billboard axes for the star/dust sprites (world space),
    // derived from the live camera each frame.
    const { right: camRight, up: camUp } = cameraBillboardBasis(ctx.cam);
    // Fixed world placement — built once, reused every frame.
    milkyWayModel ??= milkyWayModelMatrix();

    deps.milkyWayCloudRenderer.draw(pass, {
      vp: vp as Float32Array,
      viewportPx: [canvasSize.width, canvasSize.height],
      camRight,
      camUp,
      model: milkyWayModel,
      fadeAlpha,
      buffers: cloud.buffers(),
    });
  },
};
