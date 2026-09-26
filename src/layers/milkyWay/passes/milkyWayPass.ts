/**
 * milkyWayPass — the Milky Way cloud's DUST pass, plus its pick aspect, at
 * the galactic centre (`MILKY_WAY_CENTER_WORLD`).
 *
 * Dust stays here, full-res in HDR — its per-channel transmittance has to
 * land on the real cosmological accumulation; the ADDITIVE star pass lives in
 * `milkyWayAggregatePass` (see that layer's header). `enabled` delegates to
 * `deriveMilkyWayCloudAlpha`, shared with the aggregate producer and its
 * upsample consumer so the three can't disagree (`milkyWayCloudLiveness`).
 *
 * Slab is NEAR0, not COSMO: COSMO's near plane (10 kpc) would slice the
 * disc's ~9.5 kpc near edge mid-crossfade with the approach fade. NEAR0's
 * adaptive far plane can pull inside the disc's far edge on a deep descent,
 * so both vertex stages clamp clip-z just inside it (safe — both passes are
 * depthless).
 *
 * Drawn FIRST in the (hdr, NEAR0) group, after the whole (hdr, COSMO) group
 * and after `milkyWayUpsamplePass`: dust must darken the cosmological
 * accumulation and the cloud's own upsampled starlight, but not the
 * near-field starfield between the camera and the dust.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { MilkyWayRuntime } from '../@types/MilkyWayRuntime';
import { deriveMilkyWayCloudAlpha } from '../present/milkyWayCloudLiveness';
import { milkyWayCamPosModel } from '../../../services/engine/galaxyGenerator/v1/milkyWayCamPosModel';
import { milkyWayModelCached } from '../../../services/engine/galaxyGenerator/v1/milkyWayModelCached';

/**
 * Camera origin distance (Mpc) below which the impostor stops taking clicks —
 * the camera is inside the galaxy and its hit target has swallowed the view.
 *
 * The pick billboard is ONE disc sized from `MILKY_WAY_RADIUS_MPC` (17.5 kpc),
 * so its screen radius grows as the camera closes: by ~27 kpc it already spans
 * more than the viewport height and every click that isn't a star lands on the
 * Milky Way. Worse, the impostor is on NEAR0 and the cross-slab fold
 * (`frontmostPick`) is SLAB-ordered, not depth-ordered — so a NEAR0 hit beats
 * every COSMO galaxy and structure marker outright, and the backdrop's
 * "ultimate fallback" depth band (`lib/pickDepthBands.wesl`) only ranks it
 * within its own slab. Inside this distance the impostor is scenery you are
 * flying through, not a target, so pick reverts to the content in front of it.
 *
 * Eye-tuned by the user, not derived: this is where the disc's click target
 * stopped being useful in practice.
 */
const MILKY_WAY_PICK_MIN_DISTANCE_MPC = 0.0271;

export function milkyWayPass(runtime: MilkyWayRuntime): ContentPass {
  function enabled(state: PassState, ctx: FrameView, _view: SlabView): boolean {
    return deriveMilkyWayCloudAlpha(state, ctx) !== null;
  }

  return {
    name: 'milky-way',

    enabled,

    // Narrower than `enabled` — composed over it so pick stays a strict
    // subset of draw; see `MILKY_WAY_PICK_MIN_DISTANCE_MPC` above.
    pickEnabled(state, ctx, view) {
      if (!enabled(state, ctx, view)) return false;
      const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
      return camDistMpc >= MILKY_WAY_PICK_MIN_DISTANCE_MPC;
    },

    draw(pass, view, ctx, state) {
      const fadeAlpha = deriveMilkyWayCloudAlpha(state, ctx);
      if (fadeAlpha === null) return;

      runtime.cloudRenderer.drawDust(pass, {
        vp: view.vp,
        // Full-res into HDR — canvas viewport is the target viewport.
        viewportPx: view.viewportPx,
        pxPerRad: ctx.drawPxPerRad,
        // The eye, not a view plane: every sprite builds its own basis from it,
        // so a dust blob reads the same from every view of one rig.
        camPosModel: milkyWayCamPosModel(ctx.drawCamPos),
        model: milkyWayModelCached(),
        fadeAlpha,
        // The live look knobs, same as the aggregate row. The dust pass reads
        // only the model scale and fade out of the shared uniform struct, but it
        // packs the whole struct, so the values still have to be present.
        tuning: state.settings.milkyWay,
        buffers: runtime.cloud.buffers(),
      });
    },

    // Pick aspect — stamps the single invisible pick billboard at the
    // galactic centre; self-binds its @group(0) pick camera like every other
    // pickable row. Visibility isn't re-checked here — `pickEnabled` above
    // already gates the pick program's call into this row.
    drawPick(pass, view, ctx) {
      runtime.pickRenderer.pickMilkyWay(
        pass,
        view.vp,
        view.viewportPx,
        view.camPos,
        ctx.drawPxPerRad,
      );
    },
  };
}
