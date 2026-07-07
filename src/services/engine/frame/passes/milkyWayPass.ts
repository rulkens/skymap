/**
 * milkyWayPass — the Milky Way star/dust point cloud at the galactic
 * centre (`MILKY_WAY_CENTER_WORLD`, the ~8 kpc Sgr A* offset from the
 * observer origin, applied via the model matrix).
 *
 * ### What it draws
 *
 * An instanced point cloud generated on-GPU (`milkyWayCloud` owns the
 * star/dust instance buffers), drawn by `milkyWayCloudRenderer` in two
 * pipelines: an ADDITIVE star pass (soft radial glows that sum their
 * light) followed by a MULTIPLICATIVE dust pass (per-channel
 * transmittance that darkens + reddens the light behind it).  The
 * sprites are camera-facing billboards built from the live camera basis
 * each frame; the cloud's world placement (fixed galactic orientation +
 * scale + the Sgr A* centre offset) is a model matrix built once and
 * reused.
 *
 * ### When it draws
 *
 * `enabled` delegates to `milkyWayVisible` — the ONE home of the MW
 * visibility predicate, shared with the pick gate
 * (`milkyWayPickVisible`) so draw and pick can't drift.  Two gates:
 *
 *   1. `state.settings.milkyWay.enabled` — user toggle — OR a still-
 *      nonzero toggle fade (`fades.opacityOf`), which keeps the pass
 *      alive through the ~100 ms fade-out tail.
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
import { milkyWayVisible } from '../../helpers/milkyWayVisible';
import { cameraBillboardBasis } from '../../../../utils/camera/cameraBillboardBasis';
import { milkyWayModelMatrix } from '../../../gpu/galaxy/milkyWayModelMatrix';

// The cloud's world placement never changes (fixed galactic orientation +
// scale + the Sgr A* centre offset), so build the model matrix once and
// reuse the same Float32Array every frame rather than re-deriving twelve
// products per draw.
let milkyWayModel: Float32Array | null = null;

export const milkyWayPass: Pass = {
  name: 'milky-way',

  enabled(state, ctx) {
    // The shared predicate (toggle-or-fade-tail AND apparent-size band),
    // answered for THIS frame's camera — the frame-frozen ctx snapshot.
    return milkyWayVisible(state, ctx.drawCamPos, ctx.fovYRad, ctx.canvasSize.height);
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
