/**
 * milkyWayLayer — the Milky Way star/dust point cloud at the galactic
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
 * far-side / toggle predicate — AND a near-side approach fade, together
 * bounding a two-sided visibility window. The pick program runs this
 * SAME `enabled` gate (against the pick-time camera), so draw and pick
 * share ONE gate and can't drift.  Three gates:
 *
 *   1. `state.settings.milkyWay.enabled` — user toggle — OR a still-
 *      nonzero toggle fade (`fades.opacityOf`), which keeps the layer
 *      alive through the ~100 ms fade-out tail.
 *   2. `milkyWayFadeAlpha(camDist, fovY, viewportH) > 0` — the
 *      apparent-size fade band defined in
 *      `services/gpu/galaxy/milkyWayFadeAlpha.ts` (full strength while the
 *      disc spans at least `MILKY_WAY_FADE_FULL_PX` on screen, gone once it
 *      shrinks to `MILKY_WAY_FADE_GONE_PX`).
 *   3. `milkyWayApproachFadeAlpha(camDist) > 0` — the near-side fade
 *      (`utils/math/milkyWayApproachFadeAlpha.ts`): full outside ~40 kpc,
 *      gone by ~8 kpc as the camera dives inside the disc toward the solar
 *      system. Orthogonal to gate 2's apparent-size band — it is the only
 *      gate that closes at kpc range. Because it rides `enabled` it also
 *      makes a fully approach-faded disc unpickable (invisible →
 *      unpickable) — coherent, but a behaviour the pick program inherits
 *      for free from the shared gate.
 *
 * All three gates live in `enabled` so that when the camera flies well
 * beyond the local volume — or all the way inside the disc toward the
 * Sun — the whole layer is skipped: no `beginRenderPass`, no tile-RAM
 * round-trip on M1, and no idle timestamp slot in the GPU-timings panel.
 * Both fades are recomputed inside `draw` to set the shader alpha; every
 * read uses the frame-frozen `ctx.drawCamPos`, so they return the same
 * value (no race).
 *
 * ### What it reads
 *
 * - `state.gpu.milkyWayCloudRenderer` (the two-pass star/dust draw)
 * - `state.gpu.milkyWayCloud` (the generated instance buffers)
 * - `ctx.cam` (billboard basis), `view.vp`, `view.viewportPx`, `view.camPos`
 * - `state.settings.milkyWay.enabled` (user toggle, via the gate)
 *
 * ### Why drawn LAST inside the HDR content group
 *
 * Same rationale as the pre-unification inline ordering: additive blending
 * makes per-fragment colour mathematically commutative, but the
 * deterministic record points → thumbnails → filaments → milky-way
 * keeps the encoder bit-stable across HMR reloads and matches the
 * conceptual layering "background catalogue → cluster overlays →
 * local-universe skeleton → bright foreground feature".
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { milkyWayFadeAlpha } from '../../../gpu/galaxy/milkyWayFadeAlpha';
import { milkyWayApproachFadeAlpha } from '../../../../utils/math/milkyWayApproachFadeAlpha';
import { milkyWayVisible } from '../../helpers/milkyWayVisible';
import { cameraBillboardBasis } from '../../../../utils/camera/cameraBillboardBasis';
import { milkyWayModelMatrix } from '../../../gpu/galaxy/milkyWayModelMatrix';

// The cloud's world placement never changes (fixed galactic orientation +
// scale + the Sgr A* centre offset), so build the model matrix once and
// reuse the same Float32Array every frame rather than re-deriving twelve
// products per draw.
let milkyWayModel: Float32Array | null = null;

export const milkyWayLayer: ContentLayer = {
  name: 'milky-way',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // The shared far-side/toggle predicate (toggle-or-fade-tail AND
    // apparent-size band), answered for THIS frame's camera and clock —
    // the frame-frozen ctx snapshot (ctx.nowMs is the deterministic time
    // seam; layers never read the wall clock directly).
    if (!milkyWayVisible(state, ctx.drawCamPos, ctx.fovYRad, ctx.canvasSize.height, ctx.nowMs)) {
      return false;
    }
    // Near-side approach fade: close the gate once the camera has dived
    // inside the disc toward the solar system. Orthogonal to the far-side
    // band above — this is the only gate that shuts at kpc range.
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return milkyWayApproachFadeAlpha(camDistMpc) > 0;
  },

  draw(pass, view, ctx, state) {
    // The cloud buffers live on `state.gpu` (nullable, like every GPU handle).
    // They are non-null once the frame loop runs, but `enabled` doesn't
    // narrow them, so guard here — the pre-bootstrap window is the only
    // case this fires. Same for the renderer itself.
    const cloud = state.gpu.milkyWayCloud;
    if (cloud === null) return;
    const cloudRenderer = state.gpu.milkyWayCloudRenderer;
    if (cloudRenderer === null) return;

    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    // Composite the far-side apparent-size fade, the near-side approach
    // fade, and the registry-supplied toggle opacity, all on the frame
    // clock (ctx.nowMs). The renderer accepts a scalar fadeAlpha CPU-side
    // param, so multiplying opacities here is the minimal-change path — no
    // shader edits, no FadeUniforms binding.
    const toggleOpacity = state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, ctx.nowMs);
    const fadeAlpha =
      milkyWayFadeAlpha(camDistMpc, ctx.fovYRad, view.viewportPx[1]) *
      milkyWayApproachFadeAlpha(camDistMpc) *
      toggleOpacity;

    // Camera-facing billboard axes for the star/dust sprites (world space),
    // derived from the live camera each frame.
    const { right: camRight, up: camUp } = cameraBillboardBasis(ctx.cam);
    // Fixed world placement — built once, reused every frame.
    milkyWayModel ??= milkyWayModelMatrix();

    cloudRenderer.draw(pass, {
      vp: view.vp,
      viewportPx: view.viewportPx,
      camRight,
      camUp,
      model: milkyWayModel,
      fadeAlpha,
      buffers: cloud.buffers(),
    });
  },

  // Pick aspect — stamps the single invisible pick billboard at the
  // galactic centre. `pickMilkyWay` sizes it on the GPU from the shared
  // @group(0) pick camera (bound upstream by point-sprites), so there is
  // no CPU size argument and this row reads neither `view` nor `ctx`.
  //
  // Visibility is NOT re-checked here: the pick program filters by this
  // row's `enabled`, evaluated against the pick-time camera — the SAME
  // gate the draw program runs. Draw and pick share ONE gate, so the pick
  // answer can't drift from the draw answer for a given camera. The
  // renderer-null guard follows `draw`'s pre-bootstrap pattern.
  drawPick(pass, _view, _ctx, state) {
    const pickRenderer = state.gpu.milkyWayPickRenderer;
    if (pickRenderer === null) return;
    pickRenderer.pickMilkyWay(pass);
  },
};
