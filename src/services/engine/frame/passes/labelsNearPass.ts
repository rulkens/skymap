/**
 * labelsNearPass — issues the draw calls for the NEAR0 caption + leader
 * -line renderers `foregroundLabelDirector` uploads earlier in `runFrame`
 * (`enabled` therefore reads THIS frame's real demand, not a stale artifact of
 * its own draw). A second renderer pair, not the COSMO `labelsCosmoPass`'s pair,
 * because one renderer draws with one view-projection and these anchors sit
 * AU-to-parsec away, inside COSMO's fixed 10-kpc near plane.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { near0OverlayClipScale } from '../near0OverlayClipScale';
import { near0OverlayVpF32 } from '../near0OverlayVpF32';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
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

    const projection = state.subsystems.foregroundLabelDirector.project(ctx);

    // The joint both renderers bind: the coverage alpha AND the sampled depth
    // these captions clip their glyphs against, since their `occludeNearKm`
    // and the depth frame measure the same eye-relative km.
    const scene = overlaySceneOcclusion(ctx, view);

    // Lines before captions, so the glyphs composite OVER the connector where
    // they meet. A null line renderer (bootstrap gap) just skips them.
    // The leaders still draw in clip space, through the camera-rebased vp.
    if (lineRenderer !== null) {
      const vpF32 = near0OverlayVpF32(
        rebaseViewProj(view.slab.vp, ctx.drawCamPos),
        near0OverlayClipScale(view.slab.near),
      );
      lineRenderer.draw(pass, vpF32, projection.output.sizePx, ctx.drawPxPerRad, scene);
    }
    renderer.draw(pass, projection, scene);
  },

  // Pick aspect — grace-padded ink boxes for the drawn captions, stamped with
  // the SAME packed id the body's own sphere/glint pick writes, so a caption
  // click and a body click resolve to one selection. Uses
  // `near0LabelProjection` (the projection the captions are drawn
  // through), not `view.vp` — the caption anchors are camera-relative.
  // `bodyGlintsPass.drawPick` widens its own pick to this caption range for
  // the same affordance.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.labelPickRendererNear;
    const fontAtlases = state.gpu.fontAtlases;
    if (pickRenderer === null || fontAtlases === null) return;

    const projection = state.subsystems.foregroundLabelDirector.project(ctx);
    const quads = labelPickQuads({
      labels: state.subsystems.foregroundLabelDirector.labels(),
      projection,
      measure: (label) => textLayoutOf(fontAtlases.metricsByFont, label).bbox,
    });
    pickRenderer.draw(pass, quads, view.window);
  },
};
