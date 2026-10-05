/**
 * milkyWayAggregatePass — the Milky Way cloud's ADDITIVE star pass, drawn
 * into the reduced-resolution `mw-aggregate` offscreen (full rationale in
 * `milkyWayAggregateTarget.ts`). The DUST pass stays in `milkyWayPass`,
 * full-res in HDR, since its multiplicative transmittance has to land on the
 * real cosmological accumulation.
 *
 * Viewport is the DOWNSCALED size, not the canvas — `stars.wesl` clamps each
 * sprite in pixels OF THE TARGET BEING RENDERED (see `milkyWayAggregateTarget.ts`).
 * Slab is NEAR0, not COSMO — see `milkyWayPass`'s header for the full note.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { MilkyWayRuntime } from '../@types/MilkyWayRuntime';
import { deriveMilkyWayCloudAlpha } from '../present/milkyWayCloudLiveness';
import { milkyWayCamPosModel } from '../../../services/engine/galaxyGenerator/v1/milkyWayCamPosModel';
import { milkyWayModelCached } from '../../../services/engine/galaxyGenerator/v1/milkyWayModelCached';

export function milkyWayAggregatePass(runtime: MilkyWayRuntime): ContentPass {
  return {
    name: 'milky-way-aggregate',

    // Shared with the upsample consumer and the dust row — see
    // `milkyWayCloudLiveness` on why all three must answer identically.
    enabled(state, ctx, _view) {
      return deriveMilkyWayCloudAlpha(state, ctx) !== null;
    },

    draw(pass, view, ctx, state) {
      const fadeAlpha = deriveMilkyWayCloudAlpha(state, ctx);
      if (fadeAlpha === null) return;

      // Load-bearing size, not cosmetic — see the module header.
      const { width: vw, height: vh } = ctx.snapshot.renderTargets.sizeOf('mw-aggregate');

      runtime.cloudRenderer.drawStars(pass, {
        vp: view.vp,
        viewportPx: [vw, vh],
        // A target spanning the same frustum in fewer rows scales the focal
        // term with its height (as `drawStarStream` does for its half-res row).
        pxPerRad: ctx.drawPxPerRad * (vh / ctx.canvasSize.height),
        // The eye, not a view plane — see `milkyWayPass`.
        camPosModel: milkyWayCamPosModel(ctx.drawCamPos),
        model: milkyWayModelCached(),
        fadeAlpha,
        // The live look knobs — `MilkyWaySettings` widens to `MilkyWayTuning`,
        // so the cluster passes straight through. Read here rather than in the
        // renderer so a DebugPanel slider drag lands on the next frame with no
        // imperative setter in between.
        tuning: state.settings.milkyWay,
        buffers: runtime.cloud.buffers(),
      });
    },
  };
}
