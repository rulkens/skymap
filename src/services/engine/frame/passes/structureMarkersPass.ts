/**
 * structureMarkersPass — halo + ring draws for every structure category
 * (cluster / supercluster / void / group), into the hdr layer, NOT the swap
 * target: halos are additive emissive content that tone-maps alongside the
 * point sprites. After volumeUpsamplePass so halos composite over the cosmic
 * web.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';
import { structureMarkersPlanner } from '../planners/structureMarkersPlanner';

export const structureMarkersPass: ContentPass = {
  name: 'structure-markers',

  enabled(state, ctx, _view) {
    if (state.gpu.structureMarkerRenderer === null) return false;
    // The PLANNED list, never the renderer's marker count: `draw` is what
    // uploads the instances, and this gate decides whether `draw` runs.
    if (ctx.snapshot.plans.get(structureMarkersPlanner, ctx).length === 0) return false;
    // Opacity-zero gate: past the goneAt edge of the surveyDeepZoom band every
    // fragment resolves to alpha 0 (rings and halos dissolve on the descent
    // into the solar system, like the survey points), so the executor should
    // drop the layer from the pass plan entirely. Keyed on distance from the
    // heliocentric render origin.
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc) > 0;
  },

  // The pick program derives its own frame context (`pickFrameContext`), which
  // no plan row has filled, so the pick gate reads the instances the last drawn
  // frame uploaded — exactly what its pipeline would rasterize. Invisible ⇒
  // unpickable still holds: the band clause is the one `enabled` applies.
  pickEnabled(state, ctx, _view) {
    if (state.gpu.structureMarkerRenderer === null) return false;
    if (state.gpu.structureMarkerRenderer.markerCount() === 0) return false;
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc) > 0;
  },

  draw(pass, view, ctx, state) {
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const surveyFade = fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc);
    // The fade reaches 0 continuously before this skip engages, so no pop.
    if (surveyFade === 0) return;
    // Upload THIS view's planned markers before the draw — one instance buffer
    // is correct only because a `perView` section is its own submit
    // (`renderFrame`'s view-identity batching).
    state.gpu.structureMarkerRenderer!.setMarkers(
      ctx.snapshot.plans.get(structureMarkersPlanner, ctx),
    );
    // No FadeRegistry handle: the renderer binds a real fade group at @group(1)
    // anyway, so the BGL matches what the other HDR layers bind at that slot.
    state.gpu.structureMarkerRenderer!.draw(
      pass,
      view.vp,
      view.viewportPx,
      ctx.drawPxPerRad,
      view.camPos,
      surveyFade,
    );
  },

  // One ring-pick draw per category; the renderer ORs each category's
  // `sourceCode` into the packed identity via its own @group(2).
  drawPick(pass, view, ctx, state) {
    // Invisible ⇒ unpickable: the rings stop drawing past the band's goneAt
    // edge, so they must not claim pick hits there either.
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    if (fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc) === 0) return;
    state.gpu.structureMarkerRenderer!.pickRing(
      pass,
      view.vp,
      view.viewportPx,
      ctx.drawPxPerRad,
      view.camPos,
    );
  },
};
