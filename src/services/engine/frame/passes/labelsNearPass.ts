/**
 * labelsNearPass — issues the draw calls for the NEAR0 caption + leader
 * -line renderers `foregroundLabelDirector` uploads earlier in `runFrame`
 * (`enabled` therefore reads THIS frame's real demand, not a stale artifact of
 * its own draw). A second renderer pair, not the COSMO `labelsCosmoPass`'s pair,
 * because one renderer draws with one view-projection and these anchors sit
 * AU-to-parsec away, inside COSMO's fixed 10-kpc near plane.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { near0LabelProjection } from '../near0LabelProjection';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';
import { hasPickableLabel } from '../../../../utils/labels/hasPickableLabel';
import { labelPickQuads } from '../../../../utils/labels/labelPickQuads';
import { textLayoutOf } from '../../../gpu/labelLayout/textLayoutOf';

export const labelsNearPass: ContentPass = {
  name: 'labels-near',
  // Ranks a caption over the body disc it draws on — `ContentPass.pickTarget`.
  pickTarget: 'overlay',

  enabled(state, _ctx, _view) {
    return (
      state.gpu.labelRendererNear !== null &&
      state.subsystems.foregroundLabelDirector.labels().length > 0
    );
  },

  // Pick gate — NARROWER than `enabled`: the constellation captions carry no
  // `pickId` (they name no selectable object), so a constellations-only frame
  // must not allocate the `pick:overlay` target for a draw that stamps nothing.
  pickEnabled(state) {
    if (state.gpu.labelRendererNear === null) return false;
    return hasPickableLabel(state.subsystems.foregroundLabelDirector.labels());
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.labelRendererNear;
    if (renderer === null) return;
    const lineRenderer = state.gpu.markerLineRendererNear;

    const { vpF32, viewportPx, clipScale } = near0LabelProjection(ctx);

    // The joint both renderers bind: the coverage alpha AND the sampled depth
    // these captions clip their glyphs against, since their `occludeNearKm`
    // and the depth frame measure the same eye-relative km.
    const scene = overlaySceneOcclusion(ctx, view);

    // Lines before captions, so the glyphs composite OVER the connector where
    // they meet. A null line renderer (bootstrap gap) just skips them.
    if (lineRenderer !== null) {
      lineRenderer.draw(pass, vpF32, viewportPx, ctx.drawPxPerRad, scene);
    }
    // The captions' em rides the rescaled NEAR0 matrix, so it scales with it.
    renderer.draw(pass, vpF32, viewportPx, ctx.drawPxPerRad, {
      scene,
      clipScale,
    });
  },

  // Pick aspect — grace-padded ink boxes for the drawn captions, stamped with
  // the SAME packed id the body's own sphere/glint pick writes, so a caption
  // click and a body click resolve to one selection. Uses
  // `near0LabelProjection` (the f64-rebased vp the captions are drawn
  // through), not `view.vp` — the caption anchors are camera-relative.
  // `bodyGlintsPass.drawPick` widens its own pick to this caption range for
  // the same affordance.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.labelPickRendererNear;
    const fontAtlases = state.gpu.fontAtlases;
    if (pickRenderer === null || fontAtlases === null) return;

    const projection = near0LabelProjection(ctx);
    const quads = labelPickQuads({
      labels: state.subsystems.foregroundLabelDirector.labels(),
      projection,
      measure: (label) => textLayoutOf(fontAtlases.metricsByFont, label).bbox,
    });
    pickRenderer.draw(pass, quads, view.window);
  },
};
