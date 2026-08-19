/**
 * structureMarkersLayer — halo + ring draws for every structure category
 * (cluster / supercluster / void / group).
 *
 * Targets the hdr layer (NOT the swap target) because halos are additive
 * emissive content — they participate in tone-map alongside point
 * sprites, procedural disks, etc.  Rings are premultiplied-OVER but
 * the alpha is already in the linear HDR range; tone-map applies
 * cleanly.
 *
 * Position: after volumeUpsampleLayer so halos composite over the
 * cosmic web / volume fields rather than the other way round.  Labels
 * (a swap-target layer) still draw on top of everything HDR via the
 * post-tone-map swap render step.
 *
 * Enabled when: structureMarkerRenderer is non-null AND has at least
 * one marker queued for this frame AND the deep-zoom survey fade hasn't
 * fully completed. The band clause implements the opacity-zero principle:
 * a layer whose every fragment resolves to alpha 0 must not reach the
 * pass plan at all — gating in `enabled` lets the executor drop the whole
 * render step, not merely skip the draw body (the draw/drawPick guards
 * stay as defence in depth). Note the pick program runs this SAME
 * `enabled`, so band-faded rings also stop claiming hits via the gate.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';

export const structureMarkersLayer: ContentLayer = {
  name: 'structure-markers',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    if (state.gpu.structureMarkerRenderer === null) return false;
    if (state.gpu.structureMarkerRenderer.markerCount() === 0) return false;
    // Opacity-zero gate: past the surveyDeepZoom goneAt edge every marker
    // fragment resolves to alpha 0, so the executor should drop the layer
    // from the pass plan entirely (see the module header).
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc) > 0;
  },

  draw(pass, view, _ctx, state) {
    // fadeOpacity is the deep-zoom survey fade: marker rings + halos ride
    // the same surveyDeepZoom band as the survey points, dissolving on the
    // descent into the solar system so cosmic-scale annotations (all
    // categories, voids included) don't hang in front of the near field.
    // Keyed on distance from the heliocentric render origin, same as
    // galaxyPointSpritesLayer. The layer has no FadeRegistry handle — the
    // renderer still binds a real fade group at @group(1) so the BGL
    // matches what filaments (and other HDR layers) bind at the same slot
    // on the shared encoder; a future opacityOf({kind:'structureMarkers'})
    // toggle fade would multiply in here.
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const surveyFade = fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc);
    // Fully faded → every marker fragment would rasterize at alpha 0 into
    // the additive target: pure GPU cost for zero contribution, and the
    // fade reaches 0 continuously before the skip engages, so no pop.
    if (surveyFade === 0) return;
    state.gpu.structureMarkerRenderer!.draw(pass, view.vp, view.viewportPx, surveyFade);
  },

  // Pick aspect — one ring-pick draw per structure category (cluster / SC
  // / void / group). The renderer ORs each category's `sourceCode` into
  // the packed identity via its own @group(2), and deliberately reuses the
  // caller-bound @group(0) pick camera (it doesn't bind slot 0). Sizing +
  // camera are the shared pick uniform's concern; this row just fires the
  // draws. Same non-null shape as `draw` — the pick program's `enabled`
  // gate (`markerCount() > 0`) already narrowed the renderer.
  drawPick(pass, view, _ctx, state) {
    // Invisible → unpickable: past the surveyDeepZoom band's goneAt edge
    // the rings no longer draw (see `draw`), so they must not claim pick
    // hits either. Skipping pickRing outright is safe — it reuses the
    // caller-bound @group(0) pick camera and binds nothing itself, so no
    // downstream pick pipeline depends on this call having run.
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    if (fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc) === 0) return;
    state.gpu.structureMarkerRenderer!.pickRing(pass);
  },
};
