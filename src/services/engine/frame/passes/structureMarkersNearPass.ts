/**
 * structureMarkersNearPass: the NEAR0-slab twin of `structureMarkersCosmoPass`, for
 * categories whose registry `slab` is 'near0'. Gating, upload and pick
 * rationale live there; this file differs only in slab, renderer and bands.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { anyFadeBandVisible } from '../../../../utils/math/anyFadeBandVisible';
import { STRUCTURE_VISIBLE_BANDS_BY_SLAB } from '../../presentation/structureVisibleBands';
import { structureMarkersPlanner } from '../planners/structureMarkersPlanner';

export const structureMarkersNearPass: ContentPass = {
  name: 'structure-markers-near',

  enabled(state, ctx, _view) {
    if (state.gpu.structureMarkerNearRenderer === null) return false;
    // Band before plan: the (hdr, NEAR0) group must empty above the foreground
    // gate from camera distance alone, without reading this frame's plans.
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    if (!anyFadeBandVisible(STRUCTURE_VISIBLE_BANDS_BY_SLAB.near0, camDistMpc)) return false;
    return ctx.snapshot.plans.get(structureMarkersPlanner, ctx).length > 0;
  },

  // Pick gates on the last drawn instances, as in `structureMarkersCosmoPass`.
  pickEnabled(state, ctx, _view) {
    if (state.gpu.structureMarkerNearRenderer === null) return false;
    if (state.gpu.structureMarkerNearRenderer.markerCount() === 0) return false;
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return anyFadeBandVisible(STRUCTURE_VISIBLE_BANDS_BY_SLAB.near0, camDistMpc);
  },

  draw(pass, view, ctx, state) {
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    if (!anyFadeBandVisible(STRUCTURE_VISIBLE_BANDS_BY_SLAB.near0, camDistMpc)) return;
    state.gpu.structureMarkerNearRenderer!.setMarkers(
      ctx.snapshot.plans.get(structureMarkersPlanner, ctx),
      view.camPos,
    );
    state.gpu.structureMarkerNearRenderer!.draw(
      pass,
      view.slab.vp,
      view.viewportPx,
      ctx.drawPxPerRad,
    );
  },

  drawPick(pass, view, ctx, state) {
    // Invisible ⇒ unpickable.
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    if (!anyFadeBandVisible(STRUCTURE_VISIBLE_BANDS_BY_SLAB.near0, camDistMpc)) return;
    state.gpu.structureMarkerNearRenderer!.pickRing(
      pass,
      view.slab.vp,
      view.viewportPx,
      ctx.drawPxPerRad,
    );
  },
};
